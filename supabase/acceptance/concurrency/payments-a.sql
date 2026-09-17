-- Only the gated concurrency harness supplies validated synthetic UUID bindings.
select carebridge.review_payment(:'payment'::uuid,'verified','merchant_matched');
