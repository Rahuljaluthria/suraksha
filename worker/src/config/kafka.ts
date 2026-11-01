import "dotenv/config";
import { Kafka, logLevel, Producer, Consumer } from "kafkajs";

const brokers = (process.env.KAFKA_BROKERS || "localhost:9094")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

export const kafka = new Kafka({
  clientId: "suraksha-worker",
  brokers,
  logLevel: logLevel.ERROR,
});

export const producer: Producer = kafka.producer({
  allowAutoTopicCreation: false,
  transactionTimeout: 30000,
});

export const CONSUMER_GROUP = "suraksha-worker-group";

export const consumer: Consumer = kafka.consumer({
  groupId: CONSUMER_GROUP,
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

let isProducerConnected = false;

export async function connectProducer(): Promise<void> {
  if (!isProducerConnected) {
    await producer.connect();
    isProducerConnected = true;
    console.log("[Worker Kafka] Producer connected");
  }
}

export async function disconnectProducer(): Promise<void> {
  if (isProducerConnected) {
    await producer.disconnect();
    isProducerConnected = false;
    console.log("[Worker Kafka] Producer disconnected");
  }
}

