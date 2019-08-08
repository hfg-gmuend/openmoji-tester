const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const { exec } = require('child_process');
const { map, find } = require('lodash');
const multer = require('multer');
const uuidv1 = require('uuid/v1');
const openmojis = require('./openmoji/data/openmoji.json');

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

app.post('/test',
  prepareTmpDir,
  upload.array('svgFiles'),
  checkUpload,
  prepareOpenmojiJson,
  runTest,
  deleteTmpDir,
  sendReport
);

function checkUpload(req, res, next) {
  const files = req.files;
  if (files.length === 0) {
    return res.status(500).send('Please choose some OpenMoji svg files! :)');
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
  const openmojisResults = map(files, f => {
    const filename = path.basename(f.filename, '.svg');
    let found = find(openmojis, (o) => { return o.hexcode === filename});
    if (found) {
      found.group = '';
      found.subgroups = '';
      return found;
    } else {
      return {
        "emoji": "\"�\"",
        "hexcode": filename,
        "group": "",
        "subgroups": "",
        "skintone": ""
      }
    }
  });
  fs.writeJson(path.join(req._jobDir, 'openmoji.json'), openmojisResults, err => {
    if (err) return next(err);
    next();
  })
}

function sendReport(req, res, next) {
  res.sendFile(path.join(req._jobDir, 'report.html'));
}

function deleteTmpDir(req, res, next) {
  const jobDir = req._jobDir;
  res.on('finish', () => {
    fs.remove(path.resolve(jobDir), err => {
      if (err) return console.error(err);
    });
  });
  next();
}

function runTest(req, res, next) {
  const cmd = [
    'node_modules/.bin/mocha',
    '--reporter mochawesome',
    // https://github.com/adamgruber/mochawesome-report-generator#options
    '--reporter-options', `quiet=true,reportDir=${req._jobDir},reportFilename=report,json=false,inline=true,code=false,cdn=true,reportTitle=OpenMoji-Tester,reportPageTitle=OpenMoji-Tester`,
    'openmoji/test/*.js',
    '--openmoji-data-json', `${req._jobDir}/openmoji.json`,
    '--openmoji-src-folder', `${req._jobDir}`,
  ].join(' ');
  // console.log(cmd);
  exec(cmd, (err, stdout, stderr) => {
    next();
  });
}

const listener = app.listen(port, function() {
  console.log(`Your app is listening on localhost:${listener.address().port}`);
});
