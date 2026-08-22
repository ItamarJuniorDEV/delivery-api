import { hash } from "bcrypt";
import request from "supertest";

import { app } from "@/app";
import { prisma } from "@/database/prisma";

const fixtureEmails = [
  "delivery.sale@test.local",
  "delivery.customer@test.local",
  "delivery.other@test.local",
];

async function cleanupFixtures() {
  const users = await prisma.user.findMany({
    where: { email: { in: fixtureEmails } },
    select: { id: true },
  });

  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) return;

  const deliveries = await prisma.delivery.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });

  const deliveryIds = deliveries.map((delivery) => delivery.id);
  if (deliveryIds.length > 0) {
    await prisma.deliveryLog.deleteMany({
      where: { deliveryId: { in: deliveryIds } },
    });
  }

  await prisma.delivery.deleteMany({
    where: { userId: { in: userIds } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
}

describe("Deliveries flow", () => {
  let saleToken: string;
  let customerToken: string;
  let otherCustomerToken: string;
  let customerId: string;
  let deliveryId: string;

  beforeAll(async () => {
    await cleanupFixtures();

    const password = await hash("password123", 8);

    const [sale, customer, otherCustomer] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Delivery Sale",
          email: fixtureEmails[0],
          password,
          role: "sale",
        },
      }),
      prisma.user.create({
        data: {
          name: "Delivery Customer",
          email: fixtureEmails[1],
          password,
        },
      }),
      prisma.user.create({
        data: {
          name: "Other Customer",
          email: fixtureEmails[2],
          password,
        },
      }),
    ]);

    customerId = customer.id;

    const [saleSession, customerSession, otherSession] = await Promise.all([
      request(app).post("/sessions").send({
        email: sale.email,
        password: "password123",
      }),
      request(app).post("/sessions").send({
        email: customer.email,
        password: "password123",
      }),
      request(app).post("/sessions").send({
        email: otherCustomer.email,
        password: "password123",
      }),
    ]);

    saleToken = saleSession.body.token;
    customerToken = customerSession.body.token;
    otherCustomerToken = otherSession.body.token;
  });

  beforeEach(async () => {
    const deliveries = await prisma.delivery.findMany({
      where: { userId: customerId },
      select: { id: true },
    });

    const deliveryIds = deliveries.map((delivery) => delivery.id);
    if (deliveryIds.length > 0) {
      await prisma.deliveryLog.deleteMany({
        where: { deliveryId: { in: deliveryIds } },
      });
      await prisma.delivery.deleteMany({
        where: { id: { in: deliveryIds } },
      });
    }

    const delivery = await prisma.delivery.create({
      data: {
        userId: customerId,
        description: "Base delivery",
      },
    });

    deliveryId = delivery.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "delivery_logs" DROP CONSTRAINT IF EXISTS "test_reject_status_log"'
    );
    await cleanupFixtures();
  });

  it("creates a delivery for a customer", async () => {
    const response = await request(app)
      .post("/deliveries")
      .set("Authorization", `Bearer ${saleToken}`)
      .send({
        user_id: customerId,
        description: "Notebook delivery",
      });

    expect(response.status).toBe(201);

    const delivery = await prisma.delivery.findFirst({
      where: {
        userId: customerId,
        description: "Notebook delivery",
      },
    });

    expect(delivery).not.toBeNull();
    expect(delivery?.status).toBe("processing");
  });

  it("updates status and writes its log in the same operation", async () => {
    const response = await request(app)
      .patch(`/deliveries/${deliveryId}/status`)
      .set("Authorization", `Bearer ${saleToken}`)
      .send({ status: "shipped" });

    expect(response.status).toBe(200);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { logs: true },
    });

    expect(delivery?.status).toBe("shipped");
    expect(delivery?.logs).toHaveLength(1);
    expect(delivery?.logs[0].description).toBe("shipped");
  });

  it("rolls back the status when writing the log fails", async () => {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "delivery_logs" DROP CONSTRAINT IF EXISTS "test_reject_status_log"'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "delivery_logs" ADD CONSTRAINT "test_reject_status_log" CHECK (description <> \'shipped\')'
    );

    try {
      const response = await request(app)
        .patch(`/deliveries/${deliveryId}/status`)
        .set("Authorization", `Bearer ${saleToken}`)
        .send({ status: "shipped" });

      expect(response.status).toBe(500);

      const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: { logs: true },
      });

      expect(delivery?.status).toBe("processing");
      expect(delivery?.logs).toHaveLength(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "delivery_logs" DROP CONSTRAINT IF EXISTS "test_reject_status_log"'
      );
    }
  });

  it("returns 404 when changing the status of an unknown delivery", async () => {
    const response = await request(app)
      .patch("/deliveries/00000000-0000-4000-8000-000000000999/status")
      .set("Authorization", `Bearer ${saleToken}`)
      .send({ status: "shipped" });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Entrega não encontrada");
  });

  it("allows the owner to read the delivery history", async () => {
    await prisma.deliveryLog.create({
      data: {
        deliveryId,
        description: "shipped",
      },
    });

    const response = await request(app)
      .get(`/delivery-logs/${deliveryId}/show`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(deliveryId);
    expect(response.body.logs).toHaveLength(1);
  });

  it("does not expose another customer's delivery history", async () => {
    const response = await request(app)
      .get(`/delivery-logs/${deliveryId}/show`)
      .set("Authorization", `Bearer ${otherCustomerToken}`);

    expect(response.status).toBe(401);
  });
});
