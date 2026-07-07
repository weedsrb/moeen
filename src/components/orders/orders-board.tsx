"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ORDER_BOARD_STATUSES, canTransition } from "@/types/order";
import type { OrderStatus, OrderWithCustomer } from "@/types/order";
import { OrdersBoardColumn } from "./orders-board-column";

interface OrdersBoardProps {
  orders: OrderWithCustomer[];
  onStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
}

interface DragData {
  type: "order" | "column";
  orderId?: string;
  status: OrderStatus;
}

function getDragData(value: DragEndEvent["active"]["data"]["current"]): DragData | null {
  const data = value as DragData | undefined;
  if (!data) return null;
  return data;
}

export function OrdersBoard({ orders, onStatusChange }: OrdersBoardProps) {
  const [errorOrderId, setErrorOrderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const activeData = getDragData(event.active.data.current);
    const overData = event.over ? getDragData(event.over.data.current) : null;
    if (!activeData || activeData.type !== "order" || !overData) return;

    const targetStatus = overData.status;
    const sourceStatus = activeData.status;
    const orderId = activeData.orderId;
    if (!orderId || targetStatus === sourceStatus) return;

    if (!canTransition(sourceStatus, targetStatus)) {
      setErrorOrderId(orderId);
      setErrorMessage(`Invalid transition to ${targetStatus}`);
      window.setTimeout(() => {
        setErrorOrderId(null);
        setErrorMessage(null);
      }, 3000);
      return;
    }

    try {
      await onStatusChange(orderId, targetStatus);
    } catch (error) {
      setErrorOrderId(orderId);
      setErrorMessage(error instanceof Error ? error.message : "Status update failed");
      window.setTimeout(() => {
        setErrorOrderId(null);
        setErrorMessage(null);
      }, 3000);
    }
  }

  return (
    <DndContext id="orders-board" sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-3">
        {ORDER_BOARD_STATUSES.map((status) => (
          <OrdersBoardColumn
            key={status}
            status={status}
            orders={orders.filter((order) => order.status === status)}
            errorOrderId={errorOrderId}
            errorMessage={errorMessage}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </DndContext>
  );
}
