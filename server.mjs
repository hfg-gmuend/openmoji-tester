import cheerio from 'cheerio'
import path from 'path'
import fs from 'fs-extra'
import express from 'express'
import { exec } from 'child_process'
import lodash from 'lodash';
const { find } = lodash;
const { map } = lodash;
import multer from 'multer'
import { v1 as uuidv1 } from 'uuid';
import getSvgWithAddedOutline from './modules/getSvgWithAddedOutline.mjs';

const openmojis = JSON.parse(fs.readFileSync('./openmoji/data/openmoji-tester.json', 'utf-8'));

const port = process.env.PORT || 3000;
const pathTmp = '/tmp';

const app = express();
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, req._jobDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({storage: storage});


app.use(express.static('public'))
app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.post('/test-svg',
  prepareTmpDir,
  upload.array('svgFiles'),
  checkUpload,
  prepareOpenmojiJson,
  runTestAndSaveReport,
  sendReport,
  deleteTmpDir,
);

app.post('/test-visual',
  prepareTmpDir,
  upload.array('svgFiles'),
  checkUpload,
  addOutlineToSvgs,
  prepareOpenmojiJson,
  createVisualReportAndSave,
  sendReport,
  deleteTmpDir,
);

function addOutlineToSvgs(req, res, next){
  const files = req.files;
  files.forEach( (file) => {
    const svgString = fs.readFileSync(file.path, 'utf-8')
    try{
      const outlinedSvgString = getSvgWithAddedOutline(svgString)
      fs.writeFileSync(file.path, outlinedSvgString, 'utf-8')
    }
    catch{
      console.log('adding outline didnt work')
    }
  })
  next()
  console.log(files);
}

function createVisualReportAndSave(req, res, next){
  const templateLocation = path.join('.', 'template-visual-test.html')
  let newHtml = fs.readFileSync(templateLocation, 'utf-8')

  const newLocation = path.join(req._jobDir, 'report.html')

  const files = req.files;
  let svgContent = ''
  files.forEach( (file) => {
      const svgString = fs.readFileSync(file.path, 'utf-8')
      svgContent += '<div class="emoji">'
      svgContent += '<div class="title">' + file.originalname + '</div>'
      svgContent += '<div>'
      svgContent += svgString
      svgContent += '</div>'
      svgContent += '</div>'
  })

  newHtml = newHtml.replace('{{{result}}}', svgContent)

  fs.writeFileSync(newLocation, newHtml, 'utf-8')
  next()
}

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

function runTestAndSaveReport(req, res, next) {
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
