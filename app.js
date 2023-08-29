const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

const dataFilePath = path.join(__dirname, 'data', 'formSubmissions.json');
let allFormSubmissions = loadFormSubmissions();

function loadFormSubmissions() {
  if (fs.existsSync(dataFilePath)) {
    const dataString = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(dataString);
  }
  return [];
}

function saveFormSubmissions() {
  fs.writeFileSync(dataFilePath, JSON.stringify(allFormSubmissions));
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/submit', (req, res) => {
  const formData = req.body;
  allFormSubmissions.push(formData);
  saveFormSubmissions();
  res.render('view', { formData });
});

app.post('/admin/remove/:index', (req, res) => {
  const index = parseInt(req.params.index);

  if (isNaN(index) || index < 0 || index >= allFormSubmissions.length) {
    res.status(400).send('Invalid submission index');
    return;
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
      return new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time);
    });
  } else if (sort_option === 'date_desc') {
    filteredSessions.sort((a, b) => {
      return new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time);
    });
  } else if (sort_option === 'time_asc') {
    filteredSessions.sort((a, b) => {
      return new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time);
    });
  } else if (sort_option === 'time_desc') {
    filteredSessions.sort((a, b) => {
      return new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time);
    });
  }

  if (search) {
    const searchQuery = search.toLowerCase();
    filteredSessions = filteredSessions.filter(session => {
      return (
        session.title.toLowerCase().includes(searchQuery) ||
        session.date.includes(searchQuery) ||
        session.time.includes(searchQuery)
      );
    });
  }

  res.render('sessions', { formData: filteredSessions });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
