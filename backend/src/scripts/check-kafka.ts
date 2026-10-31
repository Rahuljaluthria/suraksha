
import "dotenv/config";
import { Kafka, logLevel } from "kafkajs";

const brokers = (process.env.KAFKA_BROKERS || "localhost:9094")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

const kafka = new Kafka({
  clientId: "suraksha-kafka-setup",
  brokers,
  logLevel: logLevel.ERROR,
});

const admin = kafka.admin();

const topics = [
  {
    topic: "incident-events",
    numPartitions: 3,
    replicationFactor: 1,
  },
  {
    topic: "notification-events",
    numPartitions: 3,
    replicationFactor: 1,
  },
  {
    topic: "incident-events.dlq",
    numPartitions: 3,
    replicationFactor: 1,
  },
];

const checkKafka = async (): Promise<void> => {
  try {
    await admin.connect();
    console.log("[Kafka] Admin connected");

    await admin.createTopics({
      topics,
      waitForLeaders: true,
    });

    const existingTopics = await admin.listTopics();

    console.log("\nSURAKSHA KAFKA TOPICS");

    for (const topic of topics) {
      console.log(
        `${existingTopics.includes(topic.topic) ? "✓" : "✗"} ${topic.topic}`
      );
    }

    console.log("\nKafka topic verification completed");
  } finally {
    await admin.disconnect();
  }
};

checkKafka().catch((error) => {
  console.error("[Kafka] Setup failed:", error);
  process.exitCode = 1;
});
