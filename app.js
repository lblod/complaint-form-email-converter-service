import { app, errorHandler } from 'mu';
import { CronJob } from 'cron';
import {
  fetchFormsToBeConverted
} from './support';
import request from 'request';

const cronFrequency = process.env.COMPLAINT_FORM_CRON_PATTERN || '*/1 * * * *';
const complaintFormGraph = process.env.COMPLAINT_FORM_GRAPH || 'http://mu.semte.ch/application'

app.get('/', async function(req, res) {
  res.send('Hello from complaint-form-email-converter-service');
});

new CronJob(cronFrequency, function() {
  console.log(`Complaint form to email conversion triggered by cron job at ${new Date().toISOString()}`);
  request.patch('http://localhost/complaint-form-email-converter/');
}, null, true);

app.patch('/complaint-form-email-converter/', async function(req, res, next) {
  try {
    const forms = await fetchFormsToBeConverted(complaintFormGraph);
    if (forms.length == 0) {
      console.log(`No forms found that need to be converted`);
      return res.status(204).end();
    }
    console.log(`Found ${forms.length} forms to convert`);
  } catch (e) {
    return next(new Error(e.message));
  }
});

app.use(errorHandler);
