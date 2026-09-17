-- Only the gated concurrency harness supplies validated synthetic UUID bindings.
select carebridge.review_payment(:'payment_two'::uuid,'verified','merchant_matched');
