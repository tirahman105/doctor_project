// Never return provider strings. Categories below are the complete output vocabulary.
export function anonymousResult(r,{positiveControl=false,bearer=false}={}) {
 const result=(accepted,classification)=>({accepted,classification});
 if(r.ok || ![400,401,403,404].includes(r.status))return result(false,'unclassified_http');
 const d=r.data||{},code=typeof d.code==='string'?d.code:typeof d.error==='string'?d.error:'';
 const message=typeof d.message==='string'?d.message.trim().toLowerCase():'';
 if(!bearer && positiveControl && r.status===400 && code==='InvalidRequest')return result(true,'REJECTED_NON_AUTHORITATIVE');
 if(['InvalidRequest','InvalidArgument','MissingParameter','InvalidBucketName','InvalidKey','TenantNotFound','NoSuchBucket'].includes(code))return result(false,'invalid_request');
 if(['jwt malformed','invalid signature','jwt expired','invalid jwt','invalid token'].includes(message))return result(false,'invalid_credentials');
 if(['InvalidJWT','ExpiredToken','InvalidSignature','SignatureDoesNotMatch'].includes(code))return result(false,'invalid_credentials');
 if(['jwt must be provided','authorization header is missing','missing authorization header'].includes(message))return result(!bearer&&positiveControl,bearer?'authentication_required':'REJECTED_NON_AUTHORITATIVE');
 if(['AccessDenied','unauthorized','Unauthorized'].includes(code))return result(positiveControl,'authorization_denied');
 if(['NoSuchKey','not_found'].includes(code))return result(positiveControl,'authorization_denied');
 return result(false,'unclassified_http');
}
