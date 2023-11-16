import { app, errorHandler } from 'mu';
import { CronJob } from 'cron';
import {
  fetchFormsToBeConverted,
  fetchFormAttachments,
  createSenderEmail,
  createReceiverEmail,
  setEmailToMailbox,
  setFormAsConverted,
} from './support';
import request from 'request';

const cronFrequency = process.env.COMPLAINT_FORM_CRON_PATTERN || '*/1 * * * *';
const complaintFormGraph =
  process.env.COMPLAINT_FORM_GRAPH || 'http://mu.semte.ch/application';
const emailGraph =
  process.env.EMAIL_GRAPH || 'http://mu.semte.ch/graphs/system/email';
const fileGraph = process.env.FILE_GRAPH || 'http://mu.semte.ch/application';
const fromAddressToComplainer =
  process.env.EMAIL_FROM_ADDRESS_TO_COMPLAINER ||
  'noreply-binnenland@vlaanderen.be';
const fromAddressToAbb =
  process.env.EMAIL_FROM_ADDRESS_TO_ABB || 'noreply@lblod.info';
const toAddress = process.env.EMAIL_TO_ADDRESS || 'binnenland@vlaanderen.be';
const mailbox = process.env.MAILBOX || 'outbox';

app.get('/', async function (req, res) {
  res.send('Hello from complaint-form-email-converter-service');
});

new CronJob(
  cronFrequency,
  function () {
    console.log(
      `Complaint form to email conversion triggered by cron job at ${new Date().toISOString()}`,
    );
    request.patch('http://localhost/complaint-form-email-converter/');
  },
  null,
  true,
);

app.patch('/complaint-form-email-converter/', async function (req, res, next) {
  try {
    const forms = await fetchFormsToBeConverted(complaintFormGraph);
    if (forms.length == 0) {
      console.log('No forms found that need to be converted');
      return res.status(204).end();
    }
    console.log(`Found ${forms.length} forms to convert`);

    Promise.all(
      forms.map(async (form) => {
        try {
          console.log(`Fetching attachments for form ${form.uuid}`);
          const attachments = await fetchFormAttachments(
            complaintFormGraph,
            fileGraph,
            form.uuid,
          );

          console.log(`Creating emails for form ${form.uuid}`);
          const senderEmail = createSenderEmail(
            form,
            attachments,
            fromAddressToComplainer,
          );
          const receiverEmail = createReceiverEmail(
            form,
            attachments,
            fromAddressToAbb,
            toAddress,
          );

          console.log(`Inserting emails to mailbox "${mailbox}"`);
          await setEmailToMailbox(senderEmail, emailGraph, mailbox);
          await setEmailToMailbox(receiverEmail, emailGraph, mailbox);

          console.log(`Setting form ${form.uuid} to "converted"`);
          await setFormAsConverted(
            complaintFormGraph,
            emailGraph,
            form.uuid,
            senderEmail.uuid,
          );
          await setFormAsConverted(
            complaintFormGraph,
            emailGraph,
            form.uuid,
            receiverEmail.uuid,
          );

          console.log(`End of processing form ${form.uuid}`);
        } catch (e) {
          console.log(
            `An error has occured while processing form ${form.uuid}: ${e.message}`,
          );
        }
      }),
    );
  } catch (e) {
    return next(new Error(e.message));
  }
});

app.use(errorHandler);
