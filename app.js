require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator');
const session = require('express-session');
const mongoose = require('mongoose');

// Debug: Print MongoDB URI and SESSION_SECRET
console.log('MongoDB URI:', process.env.MONGODB_URI);
console.log('Session Secret:', process.env.SESSION_SECRET);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err.message));

// Define a schema and model for form submissions
const formSubmissionSchema = new mongoose.Schema({
  name: String,
  title: String,
  date: String,
  start_time: String,
  end_time: String,
  class: String,
  section: String,
  description: String,
  email: String,
  duration: Number
});

const FormSubmission = mongoose.model('FormSubmission', formSubmissionSchema);

const app = express();
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'yourSecretKey',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set secure: true if using HTTPS
}));

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/submit', async (req, res) => {
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

  const isSlotBooked = await FormSubmission.exists({
    date: formData.date,
    $or: [
      { start_time: { $lt: formData.end_time, $gte: formData.start_time } },
      { end_time: { $gt: formData.start_time, $lte: formData.end_time } },
      { start_time: { $lte: formData.start_time }, end_time: { $gte: formData.end_time } }
    ]
  });

  if (isSlotBooked) {
    return res.redirect(`/book?name=${encodeURIComponent(formData.name)}&title=${encodeURIComponent(formData.title)}&start_time=${encodeURIComponent(formData.start_time)}&end_time=${encodeURIComponent(formData.end_time)}&date=${encodeURIComponent(formData.date)}&class=${encodeURIComponent(formData.class)}&section=${encodeURIComponent(formData.section)}&description=${encodeURIComponent(formData.description)}&alert=booked`);
  } else {
    formData.duration = duration;
    await FormSubmission.create(formData);

    const mailOptions = {
      from: process.env.EMAIL_USER,
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

    req.session.formData = formData;

    res.render('view', { formData });
  }
});

app.post('/admin/remove/:index', async (req, res) => {
  const index = parseInt(req.params.index);

  const allSubmissions = await FormSubmission.find().exec();
  if (isNaN(index) || index < 0 || index >= allSubmissions.length) {
    return res.status(400).send('Invalid submission index');
  }
  const submissionToRemove = allSubmissions[index];
  await FormSubmission.findByIdAndRemove(submissionToRemove._id).exec();
  res.redirect('/admin');
});

app.get('/admin', async (req, res) => {
  const allFormSubmissions = await FormSubmission.find().exec();
  res.render('admin', { formData: allFormSubmissions });
});

app.get('/book', (req, res) => {
  res.render('book');
});

app.get('/sessions', async (req, res) => {
  let filteredSessions = await FormSubmission.find().exec();

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
