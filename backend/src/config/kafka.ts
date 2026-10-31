
import { Kafka, logLevel, Producer } from "kafkajs";

const brokers = (process.env.KAFKA_BROKERS || "localhost:9094")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

if (brokers.length === 0) {
  throw new Error("KAFKA_BROKERS is not configured");
}

const kafka = new Kafka({
  clientId: "suraksha-backend",
  brokers,
  logLevel: logLevel.ERROR,
});

export const kafkaProducer: Producer = kafka.producer();

export const connectKafka = async (): Promise<void> => {
  await kafkaProducer.connect();
  console.log("[Kafka] Backend producer connected");
};

export const disconnectKafka = async (): Promise<void> => {
  await kafkaProducer.disconnect();
  console.log("[Kafka] Backend producer disconnected");
};
