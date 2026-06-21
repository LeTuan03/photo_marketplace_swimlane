import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NavbarClient } from "./NavbarClient";

export async function Navbar() {
  const user = await getCurrentUser();

  let cartCount = 0;
  let unread = 0;
  let swapPending = 0;
  if (user) {
    [cartCount, unread, swapPending] = await Promise.all([
      prisma.cartItem.count({ where: { userId: user.id } }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      prisma.swapOffer.count({ where: { responderId: user.id, status: "PENDING" } }),
    ]);
  }

  return (
    <NavbarClient
      user={user ? { name: user.name, role: user.role } : null}
      cartCount={cartCount}
      unread={unread}
      swapPending={swapPending}
    />
  );
}
