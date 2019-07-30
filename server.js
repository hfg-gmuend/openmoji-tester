const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const { exec } = require('child_process');
const multer = require('multer');
const uuidv1 = require('uuid/v1');

const port = process.env.PORT || 3000;
const app = express();
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, req._jobDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });


app.use(express.static(path.resolve(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({extended:true}));


app.get('/', (request, response) => {
  response.sendFile(path.resolve(__dirname, 'public/index.html'));
});

app.post('/jobs', beforeUpload, upload.array('svgFiles'), afterUpload);

function beforeUpload(req, res, next) {
  req._jobId = uuidv1();
  req._jobDir = path.resolve(__dirname, 'public/jobs/', req._jobId);
  fs.ensureDir(req._jobDir, (err) => {
    if (err) return next(err);
    next();
  });
}

function afterUpload(req, res, next) {
  const files = req.files;
  if (!files) {
    const err = new Error('Please choose files');
    err.httpStatusCode = 400;
    return next(err);
  }
  res.json({files: files});
}

app.get('/test', (request, response) => {
  const cmd = [
    'node_modules/.bin/mocha',
    // '--reporter mochawesome',
    '--reporter-options', 'reportDir=public/jobs/13234234,reportFilename=report',
    'openmoji/test/*.js',
    '--openmoji-data-json', '$PWD/public/jobs/13234234/openmoji.json',
    '--openmoji-src-folder', '$PWD/public/jobs/13234234',
  ].join(' ');
  console.log(cmd);
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`stderr: ${stderr}`);
      return response.status(500).send('Something broke! :(')
    }
    console.log(`stdout: ${stdout}`);
    response.send(stdout);
  });
});

const listener = app.listen(port, function() {
  console.log(`Your app is listening on localhost:${listener.address().port}`);
});
