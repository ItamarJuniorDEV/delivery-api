import { Request, Response } from "express";
import { prisma } from "@/database/prisma";
import { z } from "zod";

class DeliveriesStatusController {
  async update(req: Request, res: Response) {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    const bodySchema = z.object({
      status: z.enum(["processing", "shipped", "delivered"]),
    });

    const { id } = paramsSchema.parse(req.params);
    const { status } = bodySchema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        data: { status },
        where: { id },
      });

      await tx.deliveryLog.create({
        data: {
          deliveryId: id,
          description: status,
        },
      });
    });

    return res.json();
  }
}

export { DeliveriesStatusController };
