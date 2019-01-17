import { app, errorHandler } from 'mu';
import { CronJob } from 'cron';
import {
  fetchFormsToBeConverted,
  fetchFormAttachments,
  createSenderEmail,
  createReceiverEmail
} from './support';
import request from 'request';

const cronFrequency = process.env.COMPLAINT_FORM_CRON_PATTERN || '*/1 * * * *';
const complaintFormGraph = process.env.COMPLAINT_FORM_GRAPH || 'http://mu.semte.ch/application'
const fileGraph = process.env.FILE_GRAPH || 'http://mu.semte.ch/application'
const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply-binnenland@vlaanderen.be'
const toAddress = process.env.EMAIL_TO_ADDRESS || 'binnenland@vlaanderen.be'

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

    Promise.all(forms.map(async (form) => {
      console.log(`Fetching attachments for form ${form.uuid}`);
      const attachments = await fetchFormAttachments(complaintFormGraph, fileGraph, form.uuid);

      console.log(`Creating emails for form ${form.uuid}`);
      const senderEmail = createSenderEmail(form, attachments, fromAddress);
      const receiverEmail = createReceiverEmail(form, attachments, fromAddress, toAddress);
    }));
  } catch (e) {
    return next(new Error(e.message));
  }
});

app.use(errorHandler);
