async function startWorker(): Promise<void> {
  console.log('Worker service initialized and waiting for tasks...');
}

startWorker().catch((error) => {
  console.error('Error starting worker:', error);
  process.exit(1);
});

