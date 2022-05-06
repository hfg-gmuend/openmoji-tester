import cheerio from 'cheerio'
import path from 'path'
import fs from 'fs-extra'
import express from 'express'
import { exec } from 'child_process'
import find from 'lodash'
import map from 'lodash'
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

app.post('/test',
  prepareTmpDir,
  upload.array('svgFiles'),
  checkUpload,
  processSvgs,
  prepareOpenmojiJson,
  runTestAndSaveReport,
  makeReportInline,
  mergeReports,
  deleteTmpDir,
  sendReport
);

function processSvgs(req, res, next){
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

function mergeReports(req, res, next){
  const reportLocation = path.join(req._jobDir, 'report.html')
  const report = fs.readFileSync(reportLocation, 'utf-8')

  const templateLocation = path.join('.', 'layout.html')
  let newHtml = fs.readFileSync(templateLocation, 'utf-8')
  //newHtml = newHtml.replace('{{{right_side}}}', report)

  const newLocation = path.join(req._jobDir, 'index.html')

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

  newHtml = newHtml.replace('{{{left_side}}}', svgContent)

  fs.writeFileSync(newLocation, newHtml, 'utf-8')
  next()
}

function makeReportInline(req, res, next){
  const reportLocation = path.join(req._jobDir, 'report.html')
  fs.readFile(reportLocation, 'utf8', function (err,data) {
     if (err) {
        return console.log(err);
     }
     const $ = cheerio.load(data);
     const head = $('head')
     const body = $('body')
     //$('document').append('<div>Test</div>')
     //const bodyContent = $('body').html() || ''

     //console.log($('body')[0].attribs, $('body').attribs)

     // const getAllAttributes = function (node) {
     //   // From https://github.com/cheeriojs/cheerio/issues/786
     //    return node.attributes || Object.keys(node.attribs).map(
     //        name => ({ name, value: node.attribs[name] })
     //    );
     //  };

     // var attrs = { };

     //  getAllAttributes($('body')[0]).forEach(function(idx, attr) {
     //      attrs[attr.nodeName] = attr.nodeValue;
     //  });

     var newDocument = $('<div>');
     var pseudoHead = $('<div id="pseudoHead">')
     pseudoHead.html( head.html() )
     newDocument.append(pseudoHead)

     var pseudoBody = $('<div id="pseudoBody">')
     pseudoBody.attr('data-raw', body.attr('data-raw'))
     pseudoBody.html( body.html() )
     newDocument.append(pseudoBody)

     // var root = $("<section>", {id: "foo", "class": "a"}); 
     // var div = $("<div>", {id: "foo", "class": "a"});
     // div.append(head.html())
     // div.attr('raw-body', body.attr('raw-body'))
     // root.append(div)

      // const newElement = $('body').replaceWith(function () {
      //     return $("<div/>", attrs).append($(this).contents());
      // });

     fs.writeFileSync(reportLocation, newDocument.html(), 'utf-8')
     next();
  });
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
    console.log(req._jobDir)
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
  res.sendFile(path.join(req._jobDir, 'index.html'));
}

function deleteTmpDir(req, res, next) {
  // const jobDir = req._jobDir;
  // res.on('finish', () => {
  //   fs.remove(path.resolve(jobDir), err => {
  //     if (err) return console.error(err);
  //   });
  // });
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