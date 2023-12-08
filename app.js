import { app, errorHandler } from 'mu';
import * as env from './env';
import * as support from './support';
import { CronJob } from 'cron';

app.get('/', async function (req, res) {
  res.send('Hello from complaint-form-email-converter-service');
});

new CronJob(
  env.cronFrequency,
  function () {
    console.log(
      `Complaint form to email conversion triggered by cron job at ${new Date().toISOString()}`,
    );
    fetchAndConvertComplaintForms();
  },
  null,
  true,
);

app.patch('/complaint-form-email-converter/', async function (req, res, next) {
  res.status(200).end();
  try {
    await fetchAndConvertComplaintForms();
  } catch (e) {
    return next(e);
  }
});

app.post('/delta', async function (req, res, next) {
  res.status(200).end();
  try {
    //NOTE we could perform the following function based on the delta
    //changesets, by filtering and selecting for a subject of the correct type,
    //but this will be just as much "database stress" as what normally happens
    //with a cron job. So just do the same this as with a cron job.
    await fetchAndConvertComplaintForms();
  } catch (e) {
    return next(e);
  }
});

async function fetchAndConvertComplaintForms() {
  const forms = await support.fetchFormsToBeConverted(env.complaintFormGraph);
  if (forms.length) console.log('No forms found that need to be converted');
  else console.log(`Found ${forms.length} forms to convert`);

  Promise.all(
    forms.map(async (form) => {
      try {
        console.log(`Fetching attachments for form ${form.uuid}`);
        const attachments = await support.fetchFormAttachments(
          env.complaintFormGraph,
          env.fileGraph,
          form.uuid,
        );

        console.log(`Creating emails for form ${form.uuid}`);
        const senderEmail = support.createSenderEmail(
          form,
          attachments,
          env.fromAddressToComplainer,
        );
        const receiverEmail = support.createReceiverEmail(
          form,
          attachments,
          env.fromAddressToAbb,
          env.toAddress,
        );

        console.log(`Inserting emails to mailbox "${env.mailbox}"`);
        await support.setEmailToMailbox(
          senderEmail,
          env.emailGraph,
          env.mailbox,
        );
        await support.setEmailToMailbox(
          receiverEmail,
          env.emailGraph,
          env.mailbox,
        );

        console.log(`Setting form ${form.uuid} to "converted"`);
        await support.setFormAsConverted(
          env.complaintFormGraph,
          env.emailGraph,
          form.uuid,
          senderEmail.uuid,
        );
        await support.setFormAsConverted(
          env.complaintFormGraph,
          env.emailGraph,
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
}

app.use(errorHandler);
