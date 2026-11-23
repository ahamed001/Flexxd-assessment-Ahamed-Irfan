//assumptions

1. This is a pay-per-visit booking system for a fitness application
2. im assuming users already have visit credits, and every successful booking consumes one credit
3. once a booking is created, the system generated=s a unique redemption code. the user can present that code when arriving at the venue or a gym, where it can be redeemed
4. booking reserves 1 slot against the venue's daily capacity based on their creation timestamps
5. data is stored in memory and resets when the server restarts, as required by the brief