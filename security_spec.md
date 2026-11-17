# Security Specification — Industrial Foodcarts

## 1. Data Invariants
1. **Owner-Bound Foodcarts**: A `/foodcarts/{cartId}` document cannot exist or be modified unless `ownerId == request.auth.uid` on create and `ownerId` remains immutable on update; optional `foodNationality` must be a string up to 40 characters (empty when unselected).
2. **Parent-Verified Subcollections**: Every `/foodcarts/{cartId}/menuItems/{itemId}` and `/foodcarts/{cartId}/routeStops/{stopId}` document must reference an existing parent foodcart whose `ownerId == request.auth.uid` on write.
3. **PII Isolation**: User profile preferences (`/users/{userId}`) and favorites (`/users/{userId}/favorites/{cartId}`) are strictly readable and writable only by `request.auth.uid == userId`. Foodcart documents contain zero PII (no email, phone, or personal address).
4. **Order Integrity & Terminal State Locking**: Pre-orders (`/orders/{orderId}`) require `customerId == request.auth.uid` on create, `ownerId` matching the parent foodcart's `ownerId`, and `status == 'pending'`. Once `status` reaches `'picked_up'` or `'cancelled'`, no further mutations are permitted.
5. **Verified Timestamps**: All `createdAt` and `updatedAt` fields must equal `request.time` on creation/mutation, and `createdAt` is immutable on updates.
6. **Parent-Verified Live Telemetry**: Every `/foodcarts/{cartId}/telemetry/{telemetryId}` document requires parent foodcart ownership (`ownerId == request.auth.uid`) on create/update/delete, bounded GPS coordinates, and immutable `cartId`/`ownerId`/`createdAt`. Single-document `get` permits `resource == null` (returning `exists == false` when live telemetry has not started yet) and otherwise restricts reads to `isPublic == true` or `ownerId == request.auth.uid`.
7. **Location Request Gate & Terminal Decision Locking**: Customers may create `/cartRequests/{requestId}` only when `customerId == request.auth.uid`, `status == 'pending'`, and the target foodcart is listed and does not have `requestsEnabled == false`. Only the target cart's `ownerId` may transition a `'pending'` request to `'approved'` or `'denied'`, and once decided (or `'cancelled'` by the customer), no further mutations are permitted.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. **Identity Spoofing on Foodcart Create**: Authenticated user A creates `/foodcarts/cart-1` with `ownerId: "user-B"`.
2. **Shadow Ghost Field Injection**: Owner creates or updates `/foodcarts/cart-1` with an extra undeclared field `isVerified: true`.
3. **ID Poisoning**: User attempts to write `/foodcarts/` with a 1,500-character or invalid-character `cartId` (`"bad/id$1"`).
4. **Unverified Timestamp Forgery**: Owner creates a foodcart with a backdated client `createdAt` instead of `request.time`.
5. **Owner Hijack on Update**: User B attempts to update `name` or `ownerId` on User A's foodcart.
6. **Orphaned Menu Item**: Attacker creates `/foodcarts/nonexistent-cart/menuItems/item-1`.
7. **Cross-Owner Menu Tampering**: Attacker creates `/foodcarts/userA-cart/menuItems/item-1` with `ownerId: attackerUid`.
8. **Order Status Bypass on Create**: Customer submits `/orders/order-1` with `status: "ready"` instead of `"pending"`.
9. **Terminal State Mutation**: Owner or customer attempts to update an order whose existing `status` is `"picked_up"`.
10. **Customer Price Tampering After Order**: Customer updates `totalCents` or `status` to `"ready"` on an existing order.
11. **PII Blanket Read**: Authenticated User B attempts `get` or `list` on `/users/userA`.
12. **Unfiltered Order List Scraping**: Authenticated User B attempts `list` on `/orders` without filtering to `customerId == uid` or `ownerId == uid`.
