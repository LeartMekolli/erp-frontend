import { Suspense } from "react";

import { OrdersPage } from "@/components/orders/orders-page";

// The list reads its view from the URL, so it renders in the browser below this boundary.
export default function OrdersRoute() {
  return (
    <Suspense>
      <OrdersPage />
    </Suspense>
  );
}
