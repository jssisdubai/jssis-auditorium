const dotenv = require('dotenv');
dotenv.config();

const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_EMAIL = process.env.GITHUB_EMAIL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;

const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator');
const { exec } = require('child_process');

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

const dataFilePath = path.join(__dirname, 'data', 'formSubmissions.json');

// Ensure the data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Load existing form submissions
let allFormSubmissions = loadFormSubmissions();

function loadFormSubmissions() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const dataString = fs.readFileSync(dataFilePath, 'utf8');
      return JSON.parse(dataString);
    }
    return [];
  } catch (error) {
    console.error('Error loading form submissions:', error.message);
    return [];
  }
}

function saveFormSubmissions() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(allFormSubmissions, null, 2));

    // Git commit and push

    const branchName = 'main';

    const gitCommands = `
      git config --global user.email "${GITHUB_EMAIL}"
      git config --global user.name "${GITHUB_USERNAME}"
      git add ${dataFilePath}
      git commit -m "Update form submissions"
      git push https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/jssis-auditorium.git HEAD:${branchName}
    `;
    exec(gitCommands, (err, stdout, stderr) => {
      if (err) {
        console.error('Error executing Git commands:', err.message);
        return;
      }
      console.log('Changes pushed to GitHub:', stdout);
    });
  } catch (error) {
    console.error('Error saving form submissions:', error.message);
  }
}

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: "jssisauditoriumdubai@gmail.com",
    pass: "cjoc bvkw xeab ehot",
  },
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/submit', (req, res) => {
  const formData = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/; 
  const timeRegex = /^\d{2}:\d{2}$/; 

  if (!dateRegex.test(formData.date) || !timeRegex.test(formData.start_time) || !timeRegex.test(formData.end_time)) {
    return res.status(400).send('Invalid date or time format');
  }

  const startDateTime = new Date(`${formData.date}T${formData.start_time}`);
  const endDateTime = new Date(`${formData.date}T${formData.end_time}`);

  const currentDate = new Date();
  if (startDateTime < currentDate || endDateTime < currentDate) {
    return res.status(400).send('Please select a time and date in the present or near future');
  }

  const duration = (endDateTime - startDateTime) / (1000 * 60);

  const isSlotBooked = allFormSubmissions.some((booking) => {
    const bookedStartDateTime = new Date(`${booking.date}T${booking.start_time}`);
    const bookedEndDateTime = new Date(`${booking.date}T${booking.end_time}`);

    return (
      (startDateTime >= bookedStartDateTime && startDateTime < bookedEndDateTime) ||
      (endDateTime > bookedStartDateTime && endDateTime <= bookedEndDateTime) ||
      (startDateTime <= bookedStartDateTime && endDateTime >= bookedEndDateTime)
    );
  });

  if (isSlotBooked) {
    return res.redirect(`/book?name=${encodeURIComponent(formData.name)}&title=${encodeURIComponent(formData.title)}&start_time=${encodeURIComponent(formData.start_time)}&end_time=${encodeURIComponent(formData.end_time)}&date=${encodeURIComponent(formData.date)}&class=${encodeURIComponent(formData.class)}&section=${encodeURIComponent(formData.section)}&description=${encodeURIComponent(formData.description)}&alert=booked`);
  } else {
    formData.duration = duration;
    allFormSubmissions.push(formData);
    saveFormSubmissions();

    const mailOptions = {
      from: "jssisauditoriumdubai@gmail.com",
      to: formData.email,
      subject: 'Auditorium Booking Confirmation - JSS International School',
      text: `Welcome, ${formData.name}. \nBelow are the details of the auditorium session you booked:\n\nEvent: ${formData.title}\nStart Time: ${formData.start_time}\nEnd Time: ${formData.end_time}\nDate: ${formData.date}\nClass: ${formData.class}\nSection: ${formData.section}\nDescription: ${formData.description}\nDuration: ${duration} minutes`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error.message);
      } else {
        console.log('Email sent:', info.response);
      }
    });

    res.render('view', { formData });
  }
});

app.post('/admin/remove/:index', (req, res) => {
  const index = parseInt(req.params.index);

  if (isNaN(index) || index < 0 || index >= allFormSubmissions.length) {
    return res.status(400).send('Invalid submission index');
  }
  allFormSubmissions.splice(index, 1);
  saveFormSubmissions();
  res.redirect('/admin');
});

app.get('/admin', (req, res) => {
  res.render('admin', { formData: allFormSubmissions });
});

app.get('/book', (req, res) => {
  res.render('book');
});

app.get('/sessions', (req, res) => {
  let filteredSessions = [...allFormSubmissions];

  const { sort_option, search } = req.query;

  if (sort_option === 'date_asc') {
    filteredSessions.sort((a, b) => {
      return new Date(a.date + ' ' + a.start_time) - new Date(b.date + ' ' + b.start_time);
    });
  } else if (sort_option === 'date_desc') {
    filteredSessions.sort((a, b) => {
      return new Date(b.date + ' ' + b.start_time) - new Date(a.date + ' ' + a.start_time);
    });
  } else if (sort_option === 'time_asc') {
    filteredSessions.sort((a, b) => {
      return new Date(a.date + ' ' + a.start_time) - new Date(b.date + ' ' + b.start_time);
    });
  } else if (sort_option === 'time_desc') {
    filteredSessions.sort((a, b) => {
      return new Date(b.date + ' ' + b.start_time) - new Date(a.date + ' ' + a.start_time);
    });
  }

  if (search) {
    const searchQuery = search.toLowerCase();
    filteredSessions = filteredSessions.filter(session => {
      return (
        session.title.toLowerCase().includes(searchQuery) ||
        session.date.includes(searchQuery) ||
        session.start_time.includes(searchQuery) ||
        session.end_time.includes(searchQuery)
      );
    });
  }

  res.render('sessions', { formData: filteredSessions });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
