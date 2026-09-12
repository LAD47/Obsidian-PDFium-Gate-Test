#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const write=(rel,text)=>{ const p=path.join(ROOT,rel); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,text,'utf8'); };
const count=(text,needle)=>text.split(needle).length-1;
function replaceMust(rel,from,to,expected=null){
  const before=read(rel);
  const n=count(before,from);
  if(n===0) throw new Error(`${rel}: missing required text: ${from}`);
  if(expected!==null && n!==expected) throw new Error(`${rel}: expected ${expected} occurrence(s) of ${from}, found ${n}`);
  write(rel,before.split(from).join(to));
}
function replaceOptional(rel,from,to){
  const before=read(rel);
  if(before.includes(from)) write(rel,before.split(from).join(to));
}
function insertAfterMust(rel,needle,addition){
  const before=read(rel);
  if(count(before,needle)!==1) throw new Error(`${rel}: insertion anchor count != 1: ${needle}`);
  write(rel,before.replace(needle,needle+addition));
}
function filesUnder(rel,predicate=()=>true){
  const out=[];
  const start=path.join(ROOT,rel);
  function walk(dir){
    for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,ent.name);
      if(ent.isDirectory()) walk(full);
      else {
        const rp=path.relative(ROOT,full).replace(/\\/g,'/');
        if(predicate(rp)) out.push(rp);
      }
    }
  }
  walk(start);
  return out;
}
function replaceAcross(files,from,to){
  for(const rel of files){
    const before=read(rel);
    if(before.includes(from)) write(rel,before.split(from).join(to));
  }
}

const fileRecord=Buffer.from('J3VzZSBzdHJpY3QnOwoKY29uc3QgRklMRV9NRVRBREFUQV9SRUNPUkRfQ09OVFJBQ1RfVkVSU0lPTiA9ICcwLjEnOwpjb25zdCBGSUxFX01FVEFEQVRBX1JFQ09SRF9GT1JNQVRfVkVSU0lPTiA9IDE7CmNvbnN0IEZJTEVfTUVUQURBVEFfUkVDT1JEU19ST09UID0gJ0ZpbGUgTWV0YWRhdGEnOwpjb25zdCBGSUxFX01FVEFEQVRBX1JFQ09SRF9TVEFUVVNfQUNUSVZFID0gJ2FjdGl2ZSc7CmNvbnN0IEZJTEVfTUVUQURBVEFfUkVDT1JEX1NUQVRVU19NSVNTSU5HID0gJ21pc3NpbmcnOwpjb25zdCBGSUxFX01FVEFEQVRBX1JFQ09SRF9TWVNURU1fUFJPUEVSVElFUyA9IE9iamVjdC5mcmVlemUoWwogICdmaWxlbWV0YV90eXBlJywKICAnZmlsZW1ldGFfcHJvZmlsZScsCiAgJ2ZpbGVtZXRhX3ZlcnNpb24nLAogICdmaWxlbWV0YV9pZCcsCiAgJ2ZpbGVtZXRhX2ZpbGUnLAogICdmaWxlbWV0YV9zdGF0dXMnCl0pOwpjb25zdCBGSUxFX01FVEFEQVRBX1JFQ09SRF9TWVNURU1fUFJPUEVSVFlfU0VUID0gbmV3IFNldChGSUxFX01FVEFEQVRBX1JFQ09SRF9TWVNURU1fUFJPUEVSVElFUyk7CmNvbnN0IEZJTEVfTUVUQURBVEFfUkVDT1JEX1VVSURfVjRfUEFUVEVSTiA9IC9eWzAtOWEtZl17OH0tWzAtOWEtZl17NH0tNFswLTlhLWZdezN9LVs4OWFiXVswLTlhLWZdezN9LVswLTlhLWZdezEyfSQvaTsKY29uc3QgRklMRV9NRVRBREFUQV9SRUNPUkRfVE9LRU5fUEFUVEVSTiA9IC9eW2Etel1bYS16MC05Xy1dezAsNjN9JC87CgpmdW5jdGlvbiBmaWxlTWV0YWRhdGFSZWNvcmROb3JtYWxpemVWYXVsdFBhdGgodmFsdWUpIHsKICByZXR1cm4gU3RyaW5nKHZhbHVlIHx8ICcnKS5yZXBsYWNlKC9cXC9nLCAnLycpLnJlcGxhY2UoL15cLyt8XC8rJC9nLCAnJyk7Cn0KCmZ1bmN0aW9uIGZpbGVNZXRhZGF0YVJlY29yZElzVXVpZFY0KHZhbHVlKSB7CiAgcmV0dXJuIEZJTEVfTUVUQURBVEFfUkVDT1JEX1VVSURfVjRfUEFUVEVSTi50ZXN0KFN0cmluZyh2YWx1ZSB8fCAnJykpOwp9CgpmdW5jdGlvbiBmaWxlTWV0YWRhdGFSZWNvcmRQYXRoRnJvbUlkKGlkKSB7CiAgY29uc3QgdmFsdWU9U3RyaW5nKGlkIHx8ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTsKICBpZighZmlsZU1ldGFkYXRhUmVjb3JkSXNVdWlkVjQodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ2ZpbGUgbWV0YWRhdGEgcmVjb3JkIGlkIG11c3QgYmUgVVVJRCB2NCcpOwogIHJldHVybiBgJHtGSUxFX01FVEFEQVRBX1JFQ09SRFNfUk9PVH0vJHt2YWx1ZS5zbGljZSgwLDIpfS8ke3ZhbHVlfS5tZGA7Cn0KCmZ1bmN0aW9uIGZpbGVNZXRhZGF0YVJlY29yZElzUGF0aCh2YWx1ZSkgewogIGNvbnN0IHBhdGg9ZmlsZU1ldGFkYXRhUmVjb3JkTm9ybWFsaXplVmF1bHRQYXRoKHZhbHVlKTsKICByZXR1cm4gcGF0aD09PUZJTEVfTUVUQURBVEFfUkVDT1JEU19ST09UIHx8IHBhdGguc3RhcnRzV2l0aChgJHtGSUxFX01FVEFEQVRBX1JFQ09SRFNfUk9PVH0vYCk7Cn0KCmZ1bmN0aW9uIGZpbGVNZXRhZGF0YVJlY29yZEZpbGVMaW5rKGZpbGVQYXRoKSB7CiAgY29uc3QgcGF0aD1maWxlTWV0YWRhdGFSZWNvcmROb3JtYWxpemVWYXVsdFBhdGgoZmlsZVBhdGgpOwogIGlmKCFwYXRoKSB0aHJvdyBuZXcgRXJyb3IoJ2ZpbGUgbWV0YWRhdGEgcmVjb3JkIGZpbGUgcGF0aCBpcyBlbXB0eScpOwogIHJldHVybiBgW1ske3BhdGh9XV1gOwp9CgpmdW5jdGlvbiBmaWxlTWV0YWRhdGFSZWNvcmRGaWxlUGF0aEZyb21MaW5rKHZhbHVlKSB7CiAgY29uc3QgdGV4dD1TdHJpbmcodmFsdWUgfHwgJycpLnRyaW0oKTsKICBpZighdGV4dCkgcmV0dXJuICcnOwogIGNvbnN0IHdpa2k9L15cW1xbKFtcc1xTXSspXF1cXSQvLmV4ZWModGV4dCk7CiAgaWYoIXdpa2kpIHJldHVybiBmaWxlTWV0YWRhdGFSZWNvcmROb3JtYWxpemVWYXVsdFBhdGgodGV4dCk7CiAgY29uc3QgdGFyZ2V0PVN0cmluZyh3aWtpWzFdIHx8ICcnKS5zcGxpdCgnfCcsMSlbMF07CiAgcmV0dXJuIGZpbGVNZXRhZGF0YVJlY29yZE5vcm1hbGl6ZVZhdWx0UGF0aCh0YXJnZXQpOwp9CgpmdW5jdGlvbiBmaWxlTWV0YWRhdGFSZWNvcmRDbG9uZSh2YWx1ZSkgewogIHJldHVybiB2YWx1ZSA9PSBudWxsID8gdmFsdWUgOiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSk7Cn0KCmZ1bmN0aW9uIGZpbGVNZXRhZGF0YVJlY29yZElzRW1wdHlVc2VyVmFsdWUodmFsdWUpIHsKICByZXR1cm4gdmFsdWU9PT1udWxsIHx8IHZhbHVlPT09dW5kZWZpbmVkIHx8IChBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGg9PT0wKTsKfQoKZnVuY3Rpb24gZmlsZU1ldGFkYXRhUmVjb3JkTm9ybWFsaXplRnJvbnRtYXR0ZXJWYWx1ZShmaWVsZCwgdmFsdWUpIHsKICBpZih2YWx1ZT09PXVuZGVmaW5lZCB8fCB2YWx1ZT09PW51bGwpIHJldHVybiBudWxsOwogIGNvbnN0IHR5cGU9U3RyaW5nKGZpZWxkPy50eXBlIHx8ICcnKTsKICBpZih0eXBlPT09J2RhdGUnKSB7CiAgICBpZih2YWx1ZSBpbnN0YW5jZW9mIERhdGUgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlLmdldFRpbWUoKSkpIHJldHVybiB2YWx1ZS50b0lTT1N0cmluZygpLnNsaWNlKDAsMTApOwogICAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7CiAgfQogIGlmKHR5cGU9PT0ndGltZScgfHwgdHlwZT09PSd0ZXh0JyB8fCB0eXBlPT09J3NlbGVjdCcgfHwgdHlwZT09PSdsaW5rJykgcmV0dXJuIFN0cmluZyh2YWx1ZSk7CiAgaWYodHlwZT09PSdpbnRlZ2VyJyB8fCB0eXBlPT09J2RlY2ltYWwnKSByZXR1cm4gdHlwZW9mIHZhbHVlPT09J251bWJlcicgPyB2YWx1ZSA6IE51bWJlcih2YWx1ZSk7CiAgaWYodHlwZT09PSdib29sZWFuJykgcmV0dXJuIHZhbHVlPT09dHJ1ZSB8fCB2YWx1ZT09PSd0cnVlJzsKICBpZih0eXBlPT09J211bHRpc2VsZWN0JykgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpID8gdmFsdWUubWFwKGl0ZW09PlN0cmluZyhpdGVtKSkgOiAodmFsdWU9PT0nJyA/IFtdIDogW1N0cmluZyh2YWx1ZSldKTsKICByZXR1cm4gZmlsZU1ldGFkYXRhUmVjb3JkQ2xvbmUodmFsdWUpOwp9CgpmdW5jdGlvbiBmaWxlTWV0YWRhdGFSZWNvcmRGcm9tRnJvbnRtYXR0ZXIoZnJvbnRtYXR0ZXIsIHNjaGVtYSA9IG51bGwsIG9wdGlvbnMgPSB7fSkgewogIGlmKCFmcm9udG1hdHRlciB8fCB0eXBlb2YgZnJvbnRtYXR0ZXIhPT0nb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KGZyb250bWF0dGVyKSkgewogICAgcmV0dXJuIHtva2pmYWxzZSxlcnJvcjonZnJvbnRtYXR0ZXIgbWFuZ2xlciBlbGxlciBlciB1Z3lsa2RpZyd9OwogIH0KICBjb25zdCB1bmtub3duU3lzdGVtPU9iamVjdC5rZXlzKGZyb250bWF0dGVyKS5maWx0ZXIoa2V5PT5TdHJpbmcoa2V5KS5zdGFydHNXaXRoKCdmaWxlbWV0YV8nKSAmJiAhRklMRV9NRVRBREFUQV9SRUNPUkRfU1lTVEVNX1BST1BFUlRZX1NFVC5oYXMoa2V5KSk7CiAgaWYodW5rbm93blN5c3RlbS5sZW5ndGgpIHJldHVybiB7b2s6ZmFsc2UsZXJyb3I6YHVramVudGUgZmlsZW1ldGFfIHN5c3RlbWZlbHRlcjogJHt1bmtub3duU3lzdGVtLmpvaW4oJywgJyl9YH07CiAgY29uc3QgaWQ9U3RyaW5nKGZyb250bWF0dGVyLmZpbGVtZXRhX2lkIHx8ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTsKICBpZighZmlsZU1ldGFkYXRhUmVjb3JkSXNVdWlkVjQoaWQpKSByZXR1cm4ge29rOmZhbHNlLGVycm9yOidmaWxlbWV0YV9pZCBlciBpa2tlIFVVSUQgdjQnfTsKICBjb25zdCBmaWxlVHlwZT1TdHJpbmcoZnJvbnRtYXR0ZXIuZmlsZW1ldGFfdHlwZSB8fCAnJykudHJpbSgpOwogIGNvbnN0IHByb2ZpbGU9U3RyaW5nKGZyb250bWF0dGVyLmZpbGVtZXRhX3Byb2ZpbGUgfHwgJycpLnRyaW0oKTsKICBpZighRklMRV9NRVRBREFUQV9SRUNPUkRfVE9LRU5fUEFUVEVSTi50ZXN0KGZpbGVUeXBlKSkgcmV0dXJuIHtva2pmYWxzZSxlcnJvcjonZmlsZW1ldGFfdHlwZSBlciB1Z3lsa2RpZyd9OwogIGlmKCFGSUxFX01FVEFEQVRBX1JFQ09SRF9UT0tFTl9QQVRURVJOLnRlc3QocHJvZmlsZSkpIHJldHVybiB7b2s6ZmFsc2UsZXJyb3I6J2ZpbGVtZXRhX3Byb2ZpbGUgZXIgdWd5bGRpZyd9OwogIGlmKG9wdGlvbnMuZXhwZWN0ZWRUeXBlICYmIGZpbGVUeXBlIT09b3B0aW9ucy5leHBlY3RlZFR5cGUpIHJldHVybiB7b2s6ZmFsc2UsZXJyb3I6YGZpbGVtZXRhX3R5cGUgbcOlIHbDpnJlICR7b3B0aW9ucy5leHBlY3RlZFR5cGV9YH07CiAgaWYob3B0aW9ucy5leHBlY3RlZFByb2ZpbGUgJiYgcHJvZmlsZSE9PW9wdGlvbnMuZXhwZWN0ZWRQcm9maWxlKSByZXR1cm4ge29rOmZhbHNlLGVycm9yOmBmaWxlbWV0YV9wcm9maWxlIG3DpSB2w6ZyZSAke29wdGlvbnMuZXhwZWN0ZWRQcm9maWxlfWB9OwogIGlmKE51bWJlcihmcm9udG1hdHRlci5maWxlbWV0YV92ZXJzaW9uKSE9PUZJTEVfTUVUQURBVEFfUkVDT1JEX0ZPUk1BVF9WRVJTSU9OKSByZXR1cm4ge29rOmZhbHNlLGVycm9yOmBmaWxlbWV0YV92ZXJzaW9uIG3DpSB2w6ZyZSAke0ZJTEVfTUVUQURBVEFfUkVDT1JEX0ZPUk1BVF9WRVJTSU9OfWB9OwogIGNvbnN0IHN0YXR1cz1TdHJpbmcoZnJvbnRtYXR0ZXIuZmlsZW1ldGFfc3RhdHVzIHx8ICcnKTsKICBpZighW0ZJTEVfTUVUQURBVEFfUkVDT1JEX1NUQVRVU19BQ1RJVkUsRklMRV9NRVRBREFUQV9SRUNPUkRfU1RBVFVTX01JU1NJTkddLmluY2x1ZGVzKHN0YXR1cykpIHJldHVybiB7b2s6ZmFsc2UsZXJyb3I6J2ZpbGVtZXRhX3N0YXR1cyBlciB1Z3lsa2RpZyd9OwogIGNvbnN0IGZpbGVQYXRoPWZpbGVNZXRhZGF0YVJlY29yZEZpbGVQYXRoRnJvbUxpbmsoZnJvbnRtYXR0ZXIuZmlsZW1ldGFfZmlsZSk7CiAgaWYoIWZpbGVQYXRoKSByZXR1cm4ge29rOmZhbHNlLGVycm9yOidmaWxlbWV0YV9maWxlIG1hbmdsZXInfTsKICBpZih0eXBlb2Ygb3B0aW9ucy52YWxpZGF0ZUZpbGVQYXRoPT09J2Z1bmN0aW9uJykgewogICAgY29uc3QgdmFsaWRhdGVkPW9wdGlvbnMudmFsaWRhdGVGaWxlUGF0aChmaWxlUGF0aCk7CiAgICBpZih2YWxpZGF0ZWQhPT10cnVlKSByZXR1cm4ge29rOmZhbHNlLGVycm9yOnR5cGVvZiB2YWxpZGF0ZWQ9PT0nc3RyaW5nJyA/IHZhbGlkYXRlZCA6ICdmaWxlbWV0YV9maWxlIGVyIHVneWxkaWcnfTsKICB9CgogIGNvbnN0IGZpZWxkcz1BcnJheS5pc0FycmF5KHNjaGVtYT8uZmllbGRzKSA/IHNjaGVtYS5maWVsZHMgOiBbXTsKICBjb25zdCBieVByb3BlcnR5PW5ldyBNYXAoZmllbGRzLm1hcChmaWVsZD0+W2ZpZWxkLnByb3BlcnR5LGZpZWxkXSkpOwogIGNvbnN0IHZhbHVlcz17fTsKICBmb3IoY29uc3QgW2tleSxyYXddIG9mIE9iamVjdC5lbnRyaWVzKGZyb250bWF0dGVyKSkgewogICAgaWYoRklMRV9NRVRBREFUQV9SRUNPUkRfU1lTVEVNX1BST1BFUlRZX1NFVC5oYXMoa2V5KSB8fCBTdHJpbmcoa2V5KS5zdGFydHNXaXRoKCdmaWxlbWV0YV8nKSkgY29udGludWU7CiAgICBjb25zdCBmaWVsZD1ieVByb3BlcnR5LmdldChrZXkpOwogICAgdmFsdWVzW2tleV09ZmllbGQgPyBmaWxlTWV0YWRhdGFSZWNvcmROb3JtYWxpemVGcm9udG1hdHRlclZhbHVlKGZpZWxkLHJhdykgOiBmaWxlTWV0YWRhdGFSZWNvcmRDbG9uZShyYXcpOwogIH0KICByZXR1cm4ge29rOnRydWUscmVjb3JkOntpZCxmaWxlVHlwZSxwcm9maWxlLGZpbGVQYXRoLHN0YXR1cyx2YWx1ZXN9fTsKfQoKZnVuY3Rpb24gZmlsZU1ldGFkYXRhUmVjb3JkWWFtbFNjYWxhcih2YWx1ZSwgZmllbGQgPSBudWxsKSB7CiAgaWYodmFsdWU9PT1udWxsIHx8IHZhbHVlPT09dW5kZWZpbmVkKSByZXR1cm4gJ251bGwnOwogIGlmKHR5cGVvZiB2YWx1ZT09PSdib29sZWFuJykgcmV0dXJuIHZhbHVlID8gJ3RydWUnIDogJ2ZhbHNlJzsKICBpZih0eXBlb2YgdmFsdWU9PT0nbnVtYmVyJykgewogICAgaWYoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcigna2FuIGlra2Ugc2VyaWFsaXNlcmUgaWtrZS1lbmRlbGlnIHRhbGwnKTsKICAgIHJldHVybiBTdHJpbmcodmFsdWUpOwogIH0KICBjb25zdCB0ZXh0PVN0cmluZyh2YWx1ZSk7CiAgaWYoZmllbGQ/LnR5cGU9PT0nZGF0ZScgJiYgL15cZHs0fS1cZHsyfS1cZHsyfSQvLnRlc3QodGV4dCkpIHJldHVybiB0ZXh0OwogIHJldHVybiBKU09OLnN0cmluZ2lmeSh0ZXh0KTsKfQoKZnVuY3Rpb24gZmlsZU1ldGFkYXRhUmVjb3JkU2VyaWFsaXplTWFya2Rvd24ocmVjb3JkLCBzY2hlbWEgPSBudWxsLCBvcHRpb25zID0ge30pIHsKICBpZighcmVjb3JkIHx8IHR5cGVvZiByZWNvcmQhPT0nb2JqZWN0JykgdGhyb3cgbmV3IEVycm9yKCdmaWxlIG1ldGFkYXRhIHJlY29yZCBtYW5nbGVyJyk7CiAgaWYoIWZpbGVNZXRhZGF0YVJlY29yZElzVXVpZFY0KHJlY29yZC5pZCkpIHRocm93IG5ldyBFcnJvcignZmlsZSBtZXRhZGF0YSByZWNvcmQgaWQgZXIgdWd5bGRpZycpOwogIGNvbnN0IGZpbGVUeXBlPVN0cmluZyhyZWNvcmQuZmlsZVR5cGUgfHwgJycpLnRyaW0oKTsKICBjb25zdCBwcm9maWxlPVN0cmluZyhyZWNvcmQucHJvZmlsZSB8fCAnJykudHJpbSgpOwogIGlmKCFGSUxFX01FVEFEQVRBX1JFQ09SRF9UT0tFTl9QQVRURVJOLnRlc3QoZmlsZVR5cGUpKSB0aHJvdyBuZXcgRXJyb3IoJ2ZpbGUgbWV0YWRhdGEgcmVjb3JkIHR5cGUgZXIgdWd5bGRpZycpOwogIGlmKCFGSUxFX01FVEFEQVRBX1JFQ09SRF9UT0tFTl9QQVRURVJOLnRlc3QocHJvZmlsZSkpIHRocm93IG5ldyBFcnJvcignZmlsZSBtZXRhZGF0YSByZWNvcmQgcHJvZmlsZSBlciB1Z3lsa2RpZycpOwogIGNvbnN0IGZpbGVQYXRoPWZpbGVNZXRhZGF0YVJlY29yZE5vcm1hbGl6ZVZhdWx0UGF0aChyZWNvcmQuZmlsZVBhdGgpOwogIGlmKCFmaWxlUGF0aCkgdGhyb3cgbmV3IEVycm9yKCdmaWxlIG1ldGFkYXRhIHJlY29yZCBmaWxlIHBhdGggZXIgdWd5bGRpZycpOwogIGlmKHR5cGVvZiBvcHRpb25zLnZhbGlkYXRlRmlsZVBhdGg9PT0nZnVuY3Rpb24nKSB7CiAgICBjb25zdCB2YWxpZGF0ZWQ9b3B0aW9ucy52YWxpZGF0ZUZpbGVQYXRoKGZpbGVQYXRoKTsKICAgIGlmKHZhbGlkYXRlZCE9PXRydWUpIHRocm93IG5ldyBFcnJvcih0eXBlb2YgdmFsaWRhdGVkPT09J3N0cmluZycgPyB2YWxpZGF0ZWQgOiAnZmlsZSBtZXRhZGF0YSByZWNvcmQgZmlsZSBwYXRoIGVyIHVneWxkaWcnKTsKICB9CiAgaWYoIVtGSUxFX01FVEFEQVRBX1JFQ09SRF9TVEFUVVNfQUNUSVZFLCxGSUxFX01FVEFEQVRBX1JFQ09SRF9TVEFUVVNfTUlTU0lOR10uaW5jbHVkZXMocmVjb3JkLnN0YXR1cykpIHRocm93IG5ldyBFcnJvcignZmlsZSBtZXRhZGF0YSByZWNvcmQgc3RhdHVzIGVyIHVneWxkaWcnKTsKCiAgY29uc3QgbGluZXM9WyctLS0nXTsKICBsaW5lcy5wdXNoKGBmaWxlbWV0YV90eXBlOiAke2ZpbGVNZXRhZGF0YVJlY29yZFlhbWxTY2FsYXIoZmlsZVR5cGUpfWApOwogIGxpbmVzLnB1c2goYGZpbGVtZXRhX3Byb2ZpbGU6ICR7ZmlsZU1ldGFkYXRhUmVjb3JkWWFtbFNjYWxhcihwcm9maWxlKX1gKTsKICBsaW5lcy5wdXNoKGBmaWxlbWV0YV92ZXJzaW9uOiAke0ZJTEVfTUVUQURBVEFfUkVDT1JEX0ZPUk1BVF9WRVJTSU9OfWApOwogIGxpbmVzLnB1c2goYGZpbGVtZXRhX2lkOiAke2ZpbGVNZXRhZGF0YVJlY29yZFlhbWxTY2FsYXIoU3RyaW5nKHJlY29yZC5pZCkudG9Mb3dlckNhc2UoKSl9YCk7CiAgbGluZXMucHVzaChgZmlsZW1ldGFfZmlsZTogJHtmaWxlTWV0YWRhdGFSZWNvcmRZYW1sU2NhbGFyKGZpbGVNZXRhZGF0YVJlY29yZEZpbGVMaW5rKGZpbGVQYXRoKSl9YCk7CiAgbGluZXMucHVzaChgZmlsZW1ldGFfc3RhdHVzOiAke2ZpbGVNZXRhZGF0YVJlY29yZFlhbWxTY2FsYXIocmVjb3JkLnN0YXR1cyl9YCk7CgogIGNvbnN0IHZhbHVlcz1yZWNvcmQudmFsdWVzICYmIHR5cGVvZiByZWNvcmQudmFsdWVzPT09J29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkocmVjb3JkLnZhbHVlcykgPyByZWNvcmQudmFsdWVzIDoge307CiAgY29uc3QgZmllbGRzPUFycmF5LmlzQXJyYXkoc2NoZW1hPy5maWVsZHMpID8gc2NoZW1hLmZpZWxkcyA6IFtdOwogIGNvbnN0IGZpZWxkQnlQcm9wZXJ0eT1uZXcgTWFwKGZpZWxkcy5tYXAoZmllbGQ9PltmaWVsZC5wcm9wZXJ0eSxmaWVsZF0pKTsKICBjb25zdCBvcmRlcmVkPVtdOwogIGNvbnN0IHNlZW49bmV3IFNldCgpOwogIGZvcihjb25zdCBmaWVsZCBvZiBmaWVsZHMpIHsKICAgIGlmKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZXMsZmllbGQucHJvcGVydHkpKSB7CiAgICAgIG9yZGVyZWQucHVzaChmaWVsZC5wcm9wZXJ0eSk7CiAgICAgIHNlZW4uYWRkKGZpZWxkLnByb3BlcnR5KTsKICAgIH0KICB9CiAgZm9yKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh2YWx1ZXMpLnNvcnQoKGEsYik9PmEubG9jYWxlQ29tcGFyZShiKSkpIGlmKCFzZWVuLmhhcyhrZXkpICYmICFTdHJpbmcoa2V5KS5zdGFydHNXaXRoKCdmaWxlbWV0YV8nKSkgKSBvcmRlcmVkLnB1c2goa2V5KTsKCiAgZm9yKGNvbnN0IGtleSBvZiBvcmRlcmVkKSB7CiAgICBjb25zdCB2YWx1ZT12YWx1ZXNba2V5XTsKICAgIGlmKGZpbGVNZXRhZGF0YVJlY29yZElzRW1wdHlVc2VyVmFsdWUodmFsdWUpKSBjb250aW51ZTsKICAgIGNvbnN0IGZpZWxkPWZpZWxkQnlQcm9wZXJ0eS5nZXQoa2V5KSB8fCBudWxsOwogICAgaWYoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHsKICAgICAgaWYodmFsdWUubGVuZ3RoPT09MCkgY29udGludWU7CiAgICAgIGxpbmVzLnB1c2goYCR7a2V5fTpgKTsKICAgICAgZm9yKGNvbnN0IGl0ZW0gb2YgdmFsdWUpIGxpbmVzLnB1c2goYCAgLSAke2ZpbGVNZXRhZGF0YVJlY29yZFlhbWxTY2FsYXIoaXRlbSxmaWVsZCl9YCk7CiAgICB9IGVsc2UgewogICAgICBsaW5lcy5wdXNoKGAke2tleX06ICR7ZmlsZU1ldGFkYXRhUmVjb3JkWWFtbFNjYWxhcih2YWx1ZSxmaWVsZCl9YCk7CiAgICB9CiAgfQogIGxpbmVzLnB1c2goJy0tLScsJycpOwogIHJldHVybiBgJHtsaW5lcy5qb2luKCdcbicpfVxuYDsKfQoKY29uc3QgZmlsZU1ldGFkYXRhUmVjb3JkQ29udHJhY3Q9T2JqZWN0LmZyZWV6ZSh7CiAgRklMRV9NRVRBREFUQV9SRUNPUkRfQ09OVFJBQ1RfVkVSU0lPTiwKICBGSUxFX01FVEFEQVRBX1JFQ09SRF9GT1JNQVRfVkVSU0lPTiwKICBGSUxFX01FVEFEQVRBX1JFQ09SRFNfUk9PVCwKICBGSUxFX01FVEFEQVRBX1JFQ09SRF9TVEFUVVNfQUNUSVZFLAogIEZJTEVfTUVUQURBVEFfUkVDT1JEX1NUQVRVU19NSVNTSU5HLAogIEZJTEVfTUVUQURBVEFfUkVDT1JEX1NZU1RFTV9QUk9QRVJUSUVTLAogIEZJTEVfTUVUQURBVEFfUkVDT1JEX1RPS0VOX1BBVFRFUk4sCiAgZmlsZU1ldGFkYXRhUmVjb3JkTm9ybWFsaXplVmF1bHRQYXRoLAogIGZpbGVNZXRhZGF0YVJlY29yZElzVXVpZFY0LAogIGZpbGVNZXRhZGF0YVJlY29yZFBhdGhGcm9tSWQsCiAgZmlsZU1ldGFkYXRhUmVjb3JkSXNQYXRoLAogIGZpbGVNZXRhZGF0YVJlY29yZEZpbGVMaW5rLAogIGZpbGVNZXRhZGF0YVJlY29yZEZpbGVQYXRoRnJvbUxpbmssCiAgZmlsZU1ldGFkYXRhUmVjb3JkQ2xvbmUsCiAgZmlsZU1ldGFkYXRhUmVjb3JkSXNFbXB0eVVzZXJWYWx1ZSwKICBmaWxlTWV0YWRhdGFSZWNvcmROb3JtYWxpemVGcm9udG1hdHRlclZhbHVlLAogIGZpbGVNZXRhZGF0YVJlY29yZEZyb21Gcm9udG1hdHRlciwKICBmaWxlTWV0YWRhdGFSZWNvcmRTZXJpYWxpemVNYXJrZG93bgp9KTsKCm1vZHVsZS5leHBvcnRzPWZpbGVNZXRhZGF0YVJlY29yZENvbnRyYWN0Owo=','base64').toString('utf8');
const pdfRecordAdapter=Buffer.from('J3VzZSBzdHJpY3QnOwoKY29uc3QgTUVUQURBVEFfUkVDT1JEX0NPTlRSQUNUX1ZFUlNJT04gPSAnMC4yJzsKY29uc3QgTUVUQURBVEFfUkVDT1JEX0ZPUk1BVF9WRVJTSU9OID0gRklMRV9NRVRBREFUQV9SRUNPUkRfRk9STUFUX1ZFUlNJT047CmNvbnN0IE1FVEFEQVRBX1JFQ09SRF9UWVBFID0gJ3BkZic7CmNvbnN0IE1FVEFEQVRBX1JFQ09SRF9QUk9GSUxFID0gJ2RvY3VtZW50JzsKY29uc3QgTUVUQURBVEFfUkVDT1JEU19ST09UID0gRklMRV9NRVRBREFUQV9SRUNPUkRTX1JPT1Q7CmNvbnN0IE1FVEFEQVRBX1JFQ09SRF9TVEFUVVNfQUNUSVZFID0gRklMRV9NRVRBREFUQV9SRUNPUkRfU1RBVFVTX0FDVElWRTsKY29uc3QgTUVUQURBVEFfUkVDT1JEX1NUQVRVU19NSVNTSU5HID0gRklMRV9NRVRBREFUQV9SRUNPUkRfU1RBVFVTX01JU1NJTkc7CmNvbnN0IE1FVEFEQVRBX1JFQ09SRF9TWVNURU1fUFJPUEVSVElFUyA9IEZJTEVfTUVUQURBVEFfUkVDT1JEX1NZU1RFTV9QUk9QRVJUSUVTOwoKY29uc3QgbWV0YWRhdGFSZWNvcmROb3JtYWxpemVWYXVsdFBhdGggPSBmaWxlTWV0YWRhdGFSZWNvcmROb3JtYWxpemVWYXVsdFBhdGg7CmNvbnN0IG1ldGFkYXRhUmVjb3JkSXNVdWlkVjQgPSBmaWxlTWV0YWRhdGFSZWNvcmRJc1V1aWRWNDsKY29uc3QgbWV0YWRhdGFSZWNvcmRQYXRoRnJvbUlkID0gZmlsZU1ldGFkYXRhUmVjb3JkUGF0aEZyb21JZDsKY29uc3QgbWV0YWRhdGFSZWNvcmRJc1BhdGggPSBmaWxlTWV0YWRhdGFSZWNvcmRJc1BhdGg7CmNvbnN0IG1ldGFkYXRhUmVjb3JkRmlsZUxpbmsgPSBmaWxlTWV0YWRhdGFSZWNvcmRGaWxlTGluazsKY29uc3QgbWV0YWRhdGFSZWNvcmRGaWxlUGF0aEZyb21MaW5rID0gZmlsZU1ldGFkYXRhUmVjb3JkRmlsZVBhdGhGcm9tTGluazsKY29uc3QgbWV0YWRhdGFSZWNvcmRQZGZMaW5rID0gZmlsZU1ldGFkYXRhUmVjb3JkRmlsZUxpbms7CmNvbnN0IG1ldGFkYXRhUmVjb3JkUGRmUGF0aEZyb21MaW5rID0gZmlsZU1ldGFkYXRhUmVjb3JkRmlsZVBhdGhGcm9tTGluazsKY29uc3QgbWV0YWRhdGFSZWNvcmRDbG9uZSA9IGZpbGVNZXRhZGF0YVJlY29yZENsb25lOwpjb25zdCBtZXRhZGF0YVJlY29yZElzRW1wdHlVc2VyVmFsdWUgPSBmaWxlTWV0YWRhdGFSZWNvcmRJc0VtcHR5VXNlclZhbHVlOwpjb25zdCBtZXRhZGF0YVJlY29yZE5vcm1hbGl6ZUZyb250bWF0dGVyVmFsdWUgPSBmaWxlTWV0YWRhdGFSZWNvcmROb3JtYWxpemVGcm9udG1hdHRlclZhbHVlOwoKZnVuY3Rpb24gbWV0YWRhdGFSZWNvcmRWYWxpZGF0ZVBkZlBhdGgoZmlsZVBhdGgpIHsKICByZXR1cm4gL1wucGRmJC9pLnRlc3QoU3RyaW5nKGZpbGVQYXRoIHx8ICcnKSkgPyB0cnVlIDogJ2ZpbGVtZXRhX2ZpbGUgbcOlIHBla2UgdGlsIGVuIFBERic7Cn0KCmZ1bmN0aW9uIG1ldGFkYXRhUmVjb3JkRnJvbUZyb250bWF0dGVyKGZyb250bWF0dGVyLCBzY2hlbWEgPSBudWxsKSB7CiAgaWYoZnJvbnRtYXR0ZXIgJiYgdHlwZW9mIGZyb250bWF0dGVyPT09J29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkoZnJvbnRtYXR0ZXIpKSB7CiAgICBjb25zdCBsZWdhY3k9T2JqZWN0LmtleXMoZnJvbnRtYXR0ZXIpLmZpbHRlcihrZXk9PlN0cmluZyhrZXkpLnN0YXJ0c1dpdGgoJ3BkZm1ldGFfJykpOwogICAgaWYobGVnYWN5Lmxlbmd0aCkgcmV0dXJuIHtva2pmYWxzZSxlcnJvcjpgbGVnYWN5IHBkZm1ldGFfIHN5c3RlbWZlbHRlciBzdMO4dHRlcyBpa2tlIGkgMC4xLjIyMzogJHtsZWdhY3kuam9pbignLCAnKX1gfTsKICB9CiAgY29uc3QgcGFyc2VkPWZpbGVNZXRhZGF0YVJlY29yZEZyb21Gcm9udG1hdHRlcihmcm9udG1hdHRlcixzY2hlbWEsewogICAgZXhwZWN0ZWRUeXBlOk1FVEFEQVRBX1JFQ09SRF9UWVBFLAogICAgZXhwZWN0ZWRQcm9maWxlOk1FVEFEQVRBX1JFQ09SRF9QUk9GSUxFLAogICAgdmFsaWRhdGVGaWxlUGF0aDptZXRhZGF0YVJlY29yZFZhbGlkYXRlUGRmUGF0aAogIH0pOwogIGlmKCFwYXJzZWQub2spIHJldHVybiBwYXJzZWQ7CiAgcmV0dXJuIHsKICAgIG9rOnRydWUsCiAgICByZWNvcmQ6ewogICAgICBpZDpwYXJzZWQucmVjb3JkLmlkLAogICAgICBmaWxlVHlwZTpwYXJzZWQucmVjb3JkLmZpbGVUeXBlLAogICAgICBwcm9maWxlOnBhcnNlZC5yZWNvcmQucHJvZmlsZSwKICAgICAgcGRmUGF0aDpwYXJzZWQucmVjb3JkLmZpbGVQYXRoLAogICAgICBzdGF0dXM6cGFyc2VkLnJlY29yZC5zdGF0dXMsCiAgICAgIHZhbHVlczpwYXJzZWQucmVjb3JkLnZhbHVlcwogICAgfQogIH07Cn0KCmZ1bmN0aW9uIG1ldGFkYXRhUmVjb3JkU2VyaWFsaXplTWFya2Rvd24ocmVjb3JkLCBzY2hlbWEgPSBudWxsKSB7CiAgcmV0dXJuIGZpbGVNZXRhZGF0YVJlY29yZFNlcmlhbGl6ZU1hcmtkb3duKHsKICAgIGlkOnJlY29yZD8uaWQsCiAgICBmaWxlVHlwZTpNRVRBREFUQV9SRUNPUkRfVFlQRSwKICAgIHByb2ZpbGU6TUVUQURBVEFfUkVDT1JEX1BST0ZJTEUsCiAgICBmaWxlUGF0aDpyZWNvcmQ/LnBkZlBhdGgsCiAgICBzdGF0dXM6cmVjb3JkPy5zdGF0dXMsCiAgICB2YWx1ZXM6cmVjb3JkPy52YWx1ZXMKICB9LHNjaGVtYSx7dmFsaWRhdGVGaWxlUGF0aDptZXRhZGF0YVJlY29yZFZhbGlkYXRlUGRmUGF0aH0pOwp9CgpmdW5jdGlvbiBtZXRhZGF0YVJlY29yZEFwcGx5U3lzdGVtRnJvbnRtYXR0ZXIoZnJvbnRtYXR0ZXIsIHJlY29yZCkgewogIGlmKCFmcm9udG1hdHRlciB8fCB0eXBlb2YgZnJvbnRtYXR0ZXIhPT0nb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KGZyb250bWF0dGVyKSkgdGhyb3cgbmV3IEVycm9yKCdtZXRhZGF0YSByZWNvcmQgZnJvbnRtYXR0ZXIgbWFuZ2xlcicpOwogIGNvbnN0IHBkZlBhdGg9bWV0YWRhdGFSZWNvcmROb3JtYWxpemVWYXVsdFBhdGgocmVjb3JkPy5wZGZQYXRoKTsKICBjb25zdCB2YWxpZGF0ZWQ9bWV0YWRhdGFSZWNvcmRWYWxpZGF0ZVBkZlBhdGgocGRmUGF0aCk7CiAgaWYodmFsaWRhdGVkIT09dHJ1ZSkgdGhyb3cgbmV3IEVycm9yKHZhbGlkYXRlZCk7CiAgZm9yKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhmcm9udG1hdHRlcikpIGlmKFN0cmluZyhrZXkpLnN0YXJ0c1dpdGgoJ3BkZm1ldGFfJykpIGRlbGV0ZSBmcm9udG1hdHRlcltrZXldOwogIGZyb250bWF0dGVyLmZpbGVtZXRhX3R5cGU9TUVUQURBVEFfUkVDT1JEX1RZUEU7CiAgZnJvbnRtYXR0ZXIuZmlsZW1ldGFfcHJvZmlsZT1NRVRBREFUQV9SRUNPUkRfUFJPRklMRTsKICBmcm9udG1hdHRlci5maWxlbWV0YV92ZXJzaW9uPU1FVEFEQVRBX1JFQ09SRF9GT1JNQVRfVkVSU0lPTjsKICBmcm9udG1hdHRlci5maWxlbWV0YV9pZD1TdHJpbmcocmVjb3JkPy5pZCB8fCAnJykudG9Mb3dlckNhc2UoKTsKICBmcm9udG1hdHRlci5maWxlbWV0YV9maWxlPW1ldGFkYXRhUmVjb3JkRmlsZUxpbmsocGRmUGF0aCk7CiAgZnJvbnRtYXR0ZXIuZmlsZW1ldGFfc3RhdHVzPXJlY29yZD8uc3RhdHVzOwogIHJldHVybiBmcm9udG1hdHRlcjsKfQoKY29uc3QgbWV0YWRhdGFSZWNvcmRDb250cmFjdD1PYmplY3QuZnJlZXplKHsKICBNRVRBREFUQV9SRUNPUkRfQ09OVFJBQ1RfVkVSU0lPTiwKICBNRVRBREFUQV9SRUNPUkRfRk9STUFUX1ZFUlNJT04sCiAgTUVUQURBVEFfUkVDT1JEX1RZUEUsCiAgTUVUQURBVEFfUkVDT1JEX1BST0ZJTEUsCiAgTUVUQURBVEFfUkVDT1JEU19ST09ULAogIE1FVEFEQVRBX1JFQ09SRF9TVEFUVVNfQUNUSVZFLAogIE1FVEFEQVRBX1JFQ09SRF9TVEFUVVNfTUlTU0lORywKICBNRVRBREFUQV9SRUNPUkRfU1lTVEVNX1BST1BFUlRJRVMsCiAgbWV0YWRhdGFSZWNvcmROb3JtYWxpemVWYXVsdFBhdGgsCiAgbWV0YWRhdGFSZWNvcmRJc1V1aWRWNCwKICBtZXRhZGF0YVJlY29yZFBhdGhGcm9tSWQsCiAgbWV0YWRhdGFSZWNvcmRJc1BhdGgsCiAgbWV0YWRhdGFSZWNvcmRGaWxlTGluaywKICBtZXRhZGF0YVJlY29yZEZpbGVQYXRoRnJvbUxpbmssCiAgbWV0YWRhdGFSZWNvcmRQZGZMaW5rLAogIG1ldGFkYXRhUmVjb3JkUGRmUGF0aEZyb21MaW5rLAogIG1ldGFkYXRhUmVjb3JkQ2xvbmUsCiAgbWV0YWRhdGFSZWNvcmRJc0VtcHR5VXNlclZhbHVlLAogIG1ldGFkYXRhUmVjb3JkTm9ybWFsaXplRnJvbnRtYXR0ZXJWYWx1ZSwKICBtZXRhZGF0YVJlY29yZFZhbGlkYXRlUGRmUGF0aCwKICBtZXRhZGF0YVJlY29yZEZyb21Gcm9udG1hdHRlciwKICBtZXRhZGF0YVJlY29yZFNlcmlhbGl6ZU1hcmtkb3duLAogIG1ldGFkYXRhUmVjb3JkQXBwbHlTeXN0ZW1Gcm9udG1hdHRlcgp9KTsKCm1vZHVsZS5leHBvcnRzPW1ldGFkYXRhUmVjb3JkQ29udHJhY3Q7Cg==','base64').toString('utf8');

// 1. Generic file-record persistence foundation + current PDF/document adapter.
write('src/metadata/file-record-contract.js',fileRecord);

// Catch persisted-system references in current runtime sources before installing
// the PDF adapter that intentionally contains a legacy pdfmeta_ rejection.
const srcJs=filesUnder('src',rel=>rel.endsWith('.js'));
replaceAcross(srcJs,'pdfmeta_','filemeta_');
replaceAcross(srcJs,'pdf_document','pdf');
replaceAcross(srcJs,'PDF Metadata','File Metadata');
replaceAcross(srcJs,'.pdf-metadata/document-record-index-cache.json','.file-metadata/document-record-index-cache.json');
replaceAcross(srcJs,'.pdf-metadata/document-metadata-schema.json','.file-metadata/document-metadata-schema.json');
replaceAcross(srcJs,'.pdf-metadata/backup/document-metadata-schema','.file-metadata/backup/document-metadata-schema');

write('src/metadata/record-contract.js',pdfRecordAdapter);

// Bundle the generic core before the PDF adapter.
replaceMust('scripts/source-bundle.js',
  "  'schema-repository.js',\n  'record-contract.js',",
  "  'schema-repository.js',\n  'file-record-contract.js',\n  'record-contract.js',",1);

// Generic schema/config infrastructure moves out of the PDF-specific technical root.
replaceMust('src/metadata/schema-contract.js',"const METADATA_SCHEMA_ROOT = '.pdf-metadata';","const METADATA_SCHEMA_ROOT = '.file-metadata';",1);

// Repository delegates system-frontmatter persistence to the active record adapter.
replaceMust('src/metadata/record-repository.js',
`      frontmatter.filemeta_type=recordApi.METADATA_RECORD_TYPE;
      frontmatter.filemeta_version=recordApi.METADATA_RECORD_FORMAT_VERSION;
      frontmatter.filemeta_id=String(record.id).toLowerCase();
      frontmatter.filemeta_file=recordApi.metadataRecordPdfLink(record.pdfPath);
      frontmatter.filemeta_status=record.status;`,
`      recordApi.metadataRecordApplySystemFrontmatter(frontmatter,record);`,1);
replaceOptional('src/metadata/record-repository.js','filemeta_id mismatch','metadata record id mismatch');

// Generic technical cache root; cached payload remains the current PDF/document adapter shape.
replaceMust('src/metadata/record-index-cache.js',"await fileStore.ensureFolder('.pdf-metadata');","await fileStore.ensureFolder('.file-metadata');",1);

// PDF document presentation now requires both generic file type and metadata profile.
replaceMust('src/metadata/base-presentation.js',
  "  if (String(frontmatter.filemeta_type || '') !== 'pdf') return { ok:false, reason:'not-pdf-document-record', fields:[] };",
  "  if (String(frontmatter.filemeta_type || '') !== 'pdf' || String(frontmatter.filemeta_profile || '') !== 'document') return { ok:false, reason:'not-pdf-document-record', fields:[] };",1);

// Standard PDF register is a PDF/document profile view over generic records.
replaceMust('src/metadata/document-register-base-config.js',
  "    `    - ${metadataDocumentRegisterYamlString('filemeta_type == \"pdf\"')}`,",
  "    `    - ${metadataDocumentRegisterYamlString('filemeta_type == \"pdf\"')}`,\n    `    - ${metadataDocumentRegisterYamlString('filemeta_profile == \"document\"')}`,",1);

// Native example Base also demonstrates type + profile.
replaceMust('src/metadata/example-files.js',
  "    `    - ${q('filemeta_type == \"pdf\"')}`,",
  "    `    - ${q('filemeta_type == \"pdf\"')}`,\n    `    - ${q('filemeta_profile == \"document\"')}`,",1);
replaceOptional('src/metadata/example-files.js','outside `PDF Metadata/`','outside `File Metadata/`');

// Benchmark manifest follows the generic indexed record root.
replaceOptional('src/metadata/benchmark-contract.js',": 'PDF Metadata'",": 'File Metadata'");

// File Explorer presentation root follows the generic indexed record root.
replaceAcross(['styles.css'],'PDF Metadata','File Metadata');

// Version bump: foundation-only build.
const manifest=JSON.parse(read('manifest.json'));
if(manifest.version!=='0.1.222') throw new Error(`manifest baseline is ${manifest.version}, expected 0.1.222`);
manifest.version='0.1.223';
manifest.description='PDFium Gate test build 0.1.223 - file-type-neutral metadata foundation; PDF/document remains the only active profile.';
write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
const pkg=JSON.parse(read('package.json'));
if(pkg.version!=='0.1.222') throw new Error(`package baseline is ${pkg.version}, expected 0.1.222`);
pkg.version='0.1.223';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
replaceMust('src/main/00-header.js',"const PLUGIN_VERSION = '0.1.222';","const PLUGIN_VERSION = '0.1.223';",1);

// Canonical static examples migrate with the destructive pre-beta record format.
const exampleFiles=[
  'docs/examples/Example - Active PDF record.md',
  'docs/examples/Example - Missing PDF record.md',
  'docs/examples/Example PDF Document Register.base'
];
replaceAcross(exampleFiles,'pdfmeta_','filemeta_');
replaceAcross(exampleFiles,'pdf_document','pdf');
replaceAcross(exampleFiles,'PDF Metadata','File Metadata');
for(const rel of exampleFiles.filter(rel=>rel.endsWith('.md'))){
  const before=read(rel);
  if(!before.includes('filemeta_profile:')){
    if(!before.includes('filemeta_type: "pdf"')) throw new Error(`${rel} missing filemeta_type anchor`);
    write(rel,before.replace('filemeta_type: "pdf"','filemeta_type: "pdf"\nfilemeta_profile: "document"'));
  }
}
{
  const rel='docs/examples/Example PDF Document Register.base';
  const before=read(rel);
  if(!before.includes('filemeta_profile ==')){
    const anchor='    - "filemeta_type == \\"pdf\\""';
    if(!before.includes(anchor)) throw new Error('static example Base missing type filter anchor');
    write(rel,before.replace(anchor,anchor+'\n    - "filemeta_profile == \\"document\\""'));
  }
}
replaceOptional('docs/examples/README.md','PDF Metadata/','File Metadata/');

// Example verifier tracks six generic system properties and profile membership.
replaceMust('scripts/check-examples.js',
  "const systemFields = ['pdfmeta_type','pdfmeta_version','pdfmeta_id','pdfmeta_file','pdfmeta_status'];",
  "const systemFields = ['filemeta_type','filemeta_profile','filemeta_version','filemeta_id','filemeta_file','filemeta_status'];",1);
insertAfterMust('scripts/check-examples.js',
  "if (!baseExample.includes('- type: table')) fail('example Base must use native Obsidian table view');\n",
  "if (!baseExample.includes('filemeta_type == \\\\"pdf\\\\"') || !baseExample.includes('filemeta_profile == \\\\"document\\\\"')) fail('native Base must scope examples to the PDF/document profile');\n");

// Verification contracts migrate with the current pre-beta format.
replaceAcross([
  'scripts/verify/contracts/12-metadata-schema.js',
  'scripts/verify/contracts/13-safe-config-write.js',
  'scripts/verify/contracts/16-document-records.js',
  'scripts/verify/contracts/17-document-record-visibility.js',
  'scripts/verify/contracts/18-document-register-bases.js'
],'pdfmeta_','filemeta_');
replaceAcross([
  'scripts/verify/contracts/16-document-records.js',
  'scripts/verify/contracts/17-document-record-visibility.js',
  'scripts/verify/contracts/18-document-register-bases.js'
],'PDF Metadata','File Metadata');
replaceAcross([
  'scripts/verify/contracts/12-metadata-schema.js',
  'scripts/verify/contracts/13-safe-config-write.js',
  'scripts/verify/contracts/16-document-records.js'
],'.pdf-metadata/document-metadata-schema','.file-metadata/document-metadata-schema');
replaceAcross([
  'scripts/verify/contracts/12-metadata-schema.js',
  'scripts/verify/contracts/13-safe-config-write.js'
],'.pdf-metadata/backup/document-metadata-schema','.file-metadata/backup/document-metadata-schema');
replaceAcross(['scripts/verify/contracts/16-document-records.js'],'.pdf-metadata/document-record-index-cache.json','.file-metadata/document-record-index-cache.json');
replaceAcross([
  'scripts/verify/contracts/16-document-records.js',
  'scripts/verify/contracts/18-document-register-bases.js'
],'pdf_document','pdf');

// Schema verifier now owns generic schema/config technical storage.
replaceMust('scripts/verify/contracts/12-metadata-schema.js',
  "if(METADATA_SCHEMA_ROOT!=='.pdf-metadata')",
  "if(METADATA_SCHEMA_ROOT!=='.file-metadata')",1);

// Document-record verifier: new contract version, profile field and generic core behavior.
replaceMust('scripts/verify/contracts/16-document-records.js',
  "if(recordApi.METADATA_RECORD_CONTRACT_VERSION!=='0.1')",
  "if(recordApi.METADATA_RECORD_CONTRACT_VERSION!=='0.2')",1);
insertAfterMust('scripts/verify/contracts/16-document-records.js',
  "  if(recordApi.METADATA_RECORD_FORMAT_VERSION!==1) fail('metadata record format version drifted');\n",
  "  if(recordApi.METADATA_RECORD_TYPE!=='pdf'||recordApi.METADATA_RECORD_PROFILE!=='document') fail('PDF/document adapter type-profile contract drifted');\n");
replaceMust('scripts/verify/contracts/16-document-records.js',
  "    'filemeta_type: \"pdf\"',\n    'filemeta_version: 1',",
  "    'filemeta_type: \"pdf\"',\n    'filemeta_profile: \"document\"',\n    'filemeta_version: 1',",1);
replaceMust('scripts/verify/contracts/16-document-records.js',
  "    filemeta_type:'pdf',filemeta_version:1,filemeta_id:id,filemeta_file:'[[Cases/2016/example.pdf]]',filemeta_status:'active',",
  "    filemeta_type:'pdf',filemeta_profile:'document',filemeta_version:1,filemeta_id:id,filemeta_file:'[[Cases/2016/example.pdf]]',filemeta_status:'active',",1);
replaceMust('scripts/verify/contracts/16-document-records.js',
  "    'METADATA_RECORD_CONTRACT_VERSION','METADATA_RECORD_FORMAT_VERSION','METADATA_RECORD_TYPE','METADATA_RECORDS_ROOT',",
  "    'METADATA_RECORD_CONTRACT_VERSION','METADATA_RECORD_FORMAT_VERSION','METADATA_RECORD_TYPE','METADATA_RECORD_PROFILE','METADATA_RECORDS_ROOT',",1);

// Verify the generic core can represent a future HTML/web_page record without enabling product support for it.
insertAfterMust('scripts/verify/contracts/16-document-records.js',
  "  const recordApi=require(path.join(ROOT,'src/metadata/record-contract.js'));\n",
  "  const fileRecordApi=require(path.join(ROOT,'src/metadata/file-record-contract.js'));\n");
insertAfterMust('scripts/verify/contracts/16-document-records.js',
  "  const id='123e4567-e89b-42d3-a456-426614174000';\n",
`  const genericId='223e4567-e89b-42d3-a456-426614174000';
  if(fileRecordApi.FILE_METADATA_RECORDS_ROOT!=='File Metadata') fail('generic file metadata record root drifted');
  if(JSON.stringify(fileRecordApi.FILE_METADATA_RECORD_SYSTEM_PROPERTIES)!==JSON.stringify(['filemeta_type','filemeta_profile','filemeta_version','filemeta_id','filemeta_file','filemeta_status'])) fail('generic filemeta system fields drifted');
  const genericMarkdown=fileRecordApi.fileMetadataRecordSerializeMarkdown({id:genericId,fileType:'html',profile:'web_page',filePath:'Web Archive/example.html',status:'active',values:{source_url:'https://example.invalid/'}},null);
  if(!genericMarkdown.includes('filemeta_type: "html"')||!genericMarkdown.includes('filemeta_profile: "web_page"')||!genericMarkdown.includes('filemeta_file: "[[Web Archive/example.html]]"')) fail('generic file metadata serializer is still PDF-bound');
  const genericParsed=fileRecordApi.fileMetadataRecordFromFrontmatter({filemeta_type:'html',filemeta_profile:'web_page',filemeta_version:1,filemeta_id:genericId,filemeta_file:'[[Web Archive/example.html]]',filemeta_status:'active',source_url:'https://example.invalid/'});
  if(!genericParsed.ok||genericParsed.record.filePath!=='Web Archive/example.html'||genericParsed.record.fileType!=='html'||genericParsed.record.profile!=='web_page') fail('generic file metadata parser is still PDF-bound');
  const legacyParsed=recordApi.metadataRecordFromFrontmatter({pdfmeta_type:'pdf_document',pdfmeta_version:1,pdfmeta_id:id,pdfmeta_file:'[[Cases/2016/example.pdf]]',pdfmeta_status:'active'},schema);
  if(legacyParsed.ok) fail('0.1.223 unexpectedly accepted legacy pdfmeta_ pre-release records');
`);

// Bases verifier frontmatter/profile and generated Base membership.
replaceMust('scripts/verify/contracts/18-document-register-bases.js',
  "    filemeta_type:'pdf',\n    filemeta_version:1,",
  "    filemeta_type:'pdf',\n    filemeta_profile:'document',\n    filemeta_version:1,",1);
replaceMust('scripts/verify/contracts/18-document-register-bases.js',
  "if(!standardBaseYaml.includes('file.inFolder(\\\\\"File Metadata\\\\\")')||!standardBaseYaml.includes('filemeta_type == \\\\\\"pdf\\\\\\"')) fail('standard Dokumentregister Base does not scope query to canonical PDF metadata records');",
  "if(!standardBaseYaml.includes('file.inFolder(\\\\\"File Metadata\\\\\")')||!standardBaseYaml.includes('filemeta_type == \\\\\\"pdf\\\\\\"')||!standardBaseYaml.includes('filemeta_profile == \\\\\\"document\\\\\\"')) fail('standard Dokumentregister Base does not scope query to canonical PDF/document metadata records');",1);

// Current architecture/docs: persistent names are now generic. Historical docs are intentionally untouched.
const currentDocs=['README.md','ARCHITECTURE.md',...filesUnder('docs/architecture',rel=>rel.endsWith('.md')),'docs/examples/README.md'];
replaceAcross(currentDocs,'pdfmeta_','filemeta_');
replaceAcross(currentDocs,'PDF Metadata','File Metadata');
replaceAcross(currentDocs,'.pdf-metadata/document-record-index-cache.json','.file-metadata/document-record-index-cache.json');
replaceAcross(currentDocs,'.pdf-metadata/document-metadata-schema.json','.file-metadata/document-metadata-schema.json');
replaceAcross(currentDocs,'.pdf-metadata/backup/document-metadata-schema','.file-metadata/backup/document-metadata-schema');

// README storage model: split generic metadata technical storage from PDF annotation config.
replaceMust('README.md',
  "- `.pdf-metadata/` contains plugin metadata/configuration and disposable technical data such as the document-record index cache and the example-bootstrap marker.",
  "- `.file-metadata/` contains file-metadata schema/configuration and disposable technical data such as the document-record index cache.\n- `.pdf-metadata/` remains reserved for PDF-specific configuration such as highlight categories.",1);
replaceMust('README.md',
  "- `Examples-Obsidian-PDFium-Gate/` contains a one-time copied example set. These files are user-owned after creation and are never overwritten by the plugin.",
  "- `Examples-Obsidian-PDFium-Gate/` contains the optional example set. It is copied only on explicit request; re-copying warns before replacing the canonical example filenames and leaves all other files untouched.",1);

// Architecture 08: mark the filemeta foundation as implemented while PDF/document stays the only active profile.
replaceMust('docs/architecture/08-metadata-schema.md',
  "## Planned pre-beta multi-file-type metadata direction",
  "## 0.1.223 file-type-neutral metadata foundation",1);
replaceMust('docs/architecture/08-metadata-schema.md',
  "The current implementation is PDF-specific, including the reserved `filemeta_*` system namespace and `.pdf-metadata` technical storage names. Before public beta, new metadata code should be shaped so that PDF is the first supported type rather than the permanent architectural boundary.",
  "0.1.223 implements the first file-type-neutral persistence foundation. Indexed records use the reserved `filemeta_*` namespace and generic `File Metadata/` root; generic metadata schema/cache configuration uses `.file-metadata/`. PDF-specific annotation/category configuration remains under `.pdf-metadata/`. PDF with the `document` profile remains the only active product implementation.",1);
replaceMust('docs/architecture/08-metadata-schema.md',
  "The reserved technical namespace should therefore move toward a generic `filemeta_*` form before public beta while destructive pre-release schema changes are still acceptable. The exact migration/build step must be implemented and verified as explicit product work; documentation of this direction does not change the current 0.1.222 runtime by itself.",
  "The pre-release `pdfmeta_*` record namespace is intentionally not migrated or accepted by 0.1.223; test records can be recreated. This keeps the first public beta free of a legacy compatibility path. The document schema remains the active profile schema, but its storage location is no longer tied to PDF.",1);

// Architecture 09: canonical generic system set now includes profile.
replaceMust('docs/architecture/09-document-records.md',
  "Each record has stable UUID v4 identity and canonical system properties `filemeta_type`, `filemeta_version`, `filemeta_id`, `filemeta_file`, and `filemeta_status`.",
  "Each record has stable UUID v4 identity and canonical system properties `filemeta_type`, `filemeta_profile`, `filemeta_version`, `filemeta_id`, `filemeta_file`, and `filemeta_status`. For the current product implementation, `filemeta_type` is `pdf` and `filemeta_profile` is `document`.",1);

// Architecture 11 membership rule includes profile.
replaceMust('docs/architecture/11-document-register.md',
  "- generated membership is constrained to `File Metadata` + `filemeta_type == \\\"pdf\\\"`;",
  "- generated membership is constrained to `File Metadata` + `filemeta_type == \\\"pdf\\\"` + `filemeta_profile == \\\"document\\\"`;",1);

// Ensure current source has no accidental legacy namespace outside the deliberate adapter rejection.
const legacySourceHits=[];
for(const rel of filesUnder('src',rel=>rel.endsWith('.js'))){
  const text=read(rel);
  if(text.includes('pdfmeta_') && rel!=='src/metadata/record-contract.js') legacySourceHits.push(rel);
}
if(legacySourceHits.length) throw new Error(`legacy pdfmeta_ remains in current source: ${legacySourceHits.join(', ')}`);
const adapterLegacyCount=count(read('src/metadata/record-contract.js'),'pdfmeta_');
if(adapterLegacyCount<2) throw new Error('PDF adapter lost explicit legacy pdfmeta_ rejection');

if(!read('src/metadata/schema-contract.js').includes("METADATA_SCHEMA_ROOT = '.file-metadata'")) throw new Error('generic schema root missing');
if(!read('src/metadata/record-contract.js').includes("METADATA_RECORDS_ROOT = FILE_METADATA_RECORDS_ROOT")) throw new Error('PDF adapter is not bound to generic record root');

console.log('0.1.223 filemeta foundation transformation complete.');
