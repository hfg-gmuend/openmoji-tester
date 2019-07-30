const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const { exec } = require('child_process');
const { map } = require('lodash');
const multer = require('multer');
const uuidv1 = require('uuid/v1');

const port = process.env.PORT || 3000;
const pathPublic = path.resolve(__dirname, 'public');
const pathTmp = '/tmp';

const app = express();
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, req._jobDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({storage: storage});


app.use(express.static(pathPublic));
app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.get('/', (request, res) => {
  res.sendFile(path.resolve(pathPublic, 'index.html'));
});

app.post('/test',
  prepareTmpDir,
  upload.array('svgFiles'),
  checkUpload,
  prepareOpenmojiJson,
  runTest,
  sendReport
);

function checkUpload(req, res, next) {
  const files = req.files;
  if (!files) {
    const err = new Error('Please choose files');
    err.httpStatusCode = 500;
    return next(err);
  }
  next();
}

function prepareTmpDir(req, res, next) {
  req._jobId = 'openmoji-' + uuidv1();
  req._jobDir = path.resolve(pathTmp, req._jobId);
  fs.ensureDir(req._jobDir, (err) => {
    if (err) return next(err);
    next();
  });
}

function prepareOpenmojiJson(req, res, next) {
  const files = req.files;
  const openmojis = map(files, f => {
    return {
      "emoji": "",
      "hexcode": path.basename(f.filename, '.svg'),
      "group": "",
      "subgroups": "",
      "skintone": "",
      "skintone_combination": "",
      "skintone_base_emoji": "",
      "skintone_base_hexcode": ""
    }
  });
  fs.writeJson(path.join(req._jobDir, 'openmoji.json'), openmojis, err => {
    if (err) return next(err);
    next();
  })
}

function sendReport(req, res, next) {
  // res.json({files: req.files});
  res.sendFile(path.join(req._jobDir, 'report.html'));
}

function runTest(req, res, next) {
  const cmd = [
    'node_modules/.bin/mocha',
    '--reporter mochawesome',
    // https://github.com/adamgruber/mochawesome-report-generator#options
    '--reporter-options', `quiet=true,reportDir=${req._jobDir},reportFilename=report,json=false,inline=true,reportTitle=OpenMoji-Tester`,
    'openmoji/test/*.js',
    '--openmoji-data-json', `${req._jobDir}/openmoji.json`,
    '--openmoji-src-folder', `${req._jobDir}`,
  ].join(' ');
  console.log(cmd);
  exec(cmd, (err, stdout, stderr) => {
    next();
  });
}

const listener = app.listen(port, function() {
  console.log(`Your app is listening on localhost:${listener.address().port}`);
});
