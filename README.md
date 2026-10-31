# Suraksha

A full-stack, distributed application architecture featuring a modern frontend, Node.js backend with Prisma and Kafka, and an asynchronous background worker service.

## Project Structure

```text
suraksha/
├── frontend/
│   └── src/
│       ├── app/          # App initialization / providers
│       ├── components/   # Reusable UI components
│       ├── features/     # Feature-based modular logic
│       ├── pages/        # Route views / page components
│       ├── routes/       # Client routing definitions
│       ├── services/     # API integration services
│       ├── hooks/        # Custom React hooks
│       ├── types/        # TypeScript type definitions
│       └── utils/        # Frontend utilities and helpers
├── backend/
│   ├── prisma/           # Prisma schema and migrations
│   └── src/
│       ├── config/       # Environment and application configuration
│       ├── middleware/   # Express middlewares (auth, validation, etc.)
│       ├── modules/      # Feature/domain business logic modules
│       ├── kafka/        # Kafka producer and consumer configurations
│       ├── services/     # Core backend services
│       ├── utils/        # Backend helper functions
│       ├── app.ts        # Express app configuration
│       └── server.ts     # HTTP server entry point
├── worker/
│   └── src/
│       ├── consumers/    # Kafka event consumers
│       ├── publishers/   # Outgoing message/event publishers
│       ├── processors/   # Background jobs and data processing logic
│       └── index.ts      # Worker entry point
├── docker-compose.yml    # Container orchestration (Frontend, Backend, Worker, Postgres, Kafka)
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- Docker and Docker Compose
- npm, yarn, or pnpm

### Running with Docker Compose

To spin up all services including PostgreSQL and Apache Kafka:

```bash
docker-compose up -d
```

