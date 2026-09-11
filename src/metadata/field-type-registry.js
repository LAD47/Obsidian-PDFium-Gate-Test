'use strict';

const METADATA_FIELD_TYPE_REGISTRY_CONTRACT_VERSION = '0.1';

function metadataRegionalSettings(settings = {}) {
  return {
    dateFormat:String(settings.regionalDateFormat || 'DD.MM.YYYY'),
    timeFormat:String(settings.regionalTimeFormat || 'HH:mm'),
    decimalSeparator:String(settings.regionalDecimalSeparator || ',') === '.' ? '.' : ','
  };
}

function metadataPresentationSettings(settings = {}, i18n = null) {
  const source=settings && typeof settings === 'object' ? settings : {};
  const translate=(key,fallback)=>{
    try {
      const value=i18n?.t?.(key);
      return value && value !== key ? String(value) : fallback;
    } catch (_) { return fallback; }
  };
  return {
    ...source,
    uiBooleanLabels:{
      yes:translate('common.yes','Yes'),
      no:translate('common.no','No')
    }
  };
}

function metadataPad2(value) { return String(Number(value)).padStart(2, '0'); }

function metadataParseDateParts(raw, regional) {
  const text=String(raw ?? '').trim();
  if(!text) return null;
  const format=metadataRegionalSettings(regional).dateFormat;
  const defs={
    'DD.MM.YYYY':{re:/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,map:m=>({year:Number(m[3]),month:Number(m[2]),day:Number(m[1])})},
    'DD/MM/YYYY':{re:/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,map:m=>({year:Number(m[3]),month:Number(m[2]),day:Number(m[1])})},
    'MM/DD/YYYY':{re:/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,map:m=>({year:Number(m[3]),month:Number(m[1]),day:Number(m[2])})},
    'YYYY-MM-DD':{re:/^(\d{4})-(\d{1,2})-(\d{1,2})$/,map:m=>({year:Number(m[1]),month:Number(m[2]),day:Number(m[3])})}
  };
  const def=defs[format] || defs['DD.MM.YYYY'];
  const match=def.re.exec(text);
  if(!match) throw new Error(`forventet datoformat ${format}`);
  return def.map(match);
}

function metadataNormalizeDateParts(parts) {
  if(parts===null) return null;
  return `${String(parts.year).padStart(4,'0')}-${metadataPad2(parts.month)}-${metadataPad2(parts.day)}`;
}

function metadataFormatDate(value, regional) {
  if(value==null) return '';
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if(!m) return String(value);
  const format=metadataRegionalSettings(regional).dateFormat;
  if(format==='DD/MM/YYYY') return `${m[3]}/${m[2]}/${m[1]}`;
  if(format==='MM/DD/YYYY') return `${m[2]}/${m[3]}/${m[1]}`;
  if(format==='YYYY-MM-DD') return `${m[1]}-${m[2]}-${m[3]}`;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function metadataParseTimeParts(raw, regional, field) {
  const text=String(raw ?? '').trim();
  if(!text) return null;
  const precision=field?.config?.precision === 'second' ? 'second' : 'minute';
  const timeFormat=metadataRegionalSettings(regional).timeFormat;
  if(timeFormat==='h:mm A') {
    const re=precision==='second'
      ? /^(\d{1,2}):(\d{2}):(\d{2})\s*([AaPp][Mm])$/
      : /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/;
    const m=re.exec(text);
    if(!m) throw new Error(precision==='second' ? 'forventet tidsformat h:mm:ss AM/PM' : 'forventet tidsformat h:mm AM/PM');
    let hour=Number(m[1]);
    const minute=Number(m[2]);
    const second=precision==='second' ? Number(m[3]) : 0;
    const meridiem=String(m[precision==='second'?4:3]).toUpperCase();
    if(hour<1 || hour>12) throw new Error('time må være mellom 1 og 12');
    if(meridiem==='AM' && hour===12) hour=0;
    if(meridiem==='PM' && hour!==12) hour+=12;
    return {hour,minute,second,precision};
  }
  const re=precision==='second' ? /^(\d{1,2}):(\d{2}):(\d{2})$/ : /^(\d{1,2}):(\d{2})$/;
  const m=re.exec(text);
  if(!m) throw new Error(precision==='second' ? 'forventet tidsformat HH:mm:ss' : 'forventet tidsformat HH:mm');
  return {hour:Number(m[1]),minute:Number(m[2]),second:precision==='second'?Number(m[3]):0,precision};
}

function metadataNormalizeTimeParts(parts) {
  if(parts===null) return null;
  const base=`${metadataPad2(parts.hour)}:${metadataPad2(parts.minute)}`;
  return parts.precision==='second' ? `${base}:${metadataPad2(parts.second)}` : base;
}

function metadataFormatTime(value, regional, field) {
  if(value==null) return '';
  const m=/^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value));
  if(!m) return String(value);
  const settings=metadataRegionalSettings(regional);
  const precision=field?.config?.precision === 'second' ? 'second' : 'minute';
  const hour24=Number(m[1]), minute=m[2], second=m[3] || '00';
  if(settings.timeFormat==='h:mm A') {
    const suffix=hour24>=12?'PM':'AM';
    const hour12=hour24%12 || 12;
    return precision==='second' ? `${hour12}:${minute}:${second} ${suffix}` : `${hour12}:${minute} ${suffix}`;
  }
  return precision==='second' ? `${m[1]}:${minute}:${second}` : `${m[1]}:${minute}`;
}

function metadataValidateFieldValue(field, value) {
  const errors=[];
  if(value===null && field?.required) errors.push('feltet er påkrevd');
  if(field?.required && field?.type==='multiselect' && Array.isArray(value) && value.length===0) errors.push('velg minst én verdi');
  if(value!==null) metadataValidateCanonicalValue(field,value,'verdi',errors);
  return {ok:errors.length===0,errors};
}

function metadataTextInput(parent, value, placeholder = '') {
  const input=parent.createEl('input',{type:'text'});
  input.value=value==null?'':String(value);
  if(placeholder) input.setAttribute('placeholder',placeholder);
  return {inputEl:input,readRaw:()=>input.value};
}

function metadataReadText(parent, text) {
  const el=parent.createDiv({cls:'pdfium-document-info-value'});
  el.setText(text || '—');
  return el;
}

function metadataSelectOptionLabel(field, value) {
  const option=(field?.config?.options || []).find(item=>item?.value===value);
  return option?.label || String(value || '');
}

function metadataMakeDescriptor({parse,normalize,format,renderEdit}) {
  return Object.freeze({
    parse,
    normalize,
    validate:metadataValidateFieldValue,
    serialize:value=>metadataClone(value),
    format,
    renderRead(parent,{value,field,settings}) { return metadataReadText(parent,format(value,settings,field)); },
    renderEdit
  });
}

function createMetadataFieldTypeRegistry() {
  const descriptors={
    text:metadataMakeDescriptor({
      parse:raw=>{const text=String(raw ?? '').trim();return text?text:null;},
      normalize:value=>value,
      format:value=>value==null?'':String(value),
      renderEdit:(parent,{value})=>metadataTextInput(parent,value)
    }),
    date:metadataMakeDescriptor({
      parse:(raw,{settings})=>metadataParseDateParts(raw,settings),
      normalize:metadataNormalizeDateParts,
      format:(value,settings)=>metadataFormatDate(value,settings),
      renderEdit:(parent,{value,settings})=>metadataTextInput(parent,metadataFormatDate(value,settings),metadataRegionalSettings(settings).dateFormat)
    }),
    time:metadataMakeDescriptor({
      parse:(raw,{settings,field})=>metadataParseTimeParts(raw,settings,field),
      normalize:metadataNormalizeTimeParts,
      format:(value,settings,field)=>metadataFormatTime(value,settings,field),
      renderEdit:(parent,{value,settings,field})=>metadataTextInput(parent,metadataFormatTime(value,settings,field),field?.config?.precision==='second'?'HH:mm:ss':metadataRegionalSettings(settings).timeFormat)
    }),
    integer:metadataMakeDescriptor({
      parse:raw=>{const text=String(raw ?? '').trim();if(!text)return null;if(!/^[+-]?\d+$/.test(text))throw new Error('forventet heltall');return Number(text);},
      normalize:value=>value,
      format:value=>value==null?'':String(value),
      renderEdit:(parent,{value})=>metadataTextInput(parent,value)
    }),
    decimal:metadataMakeDescriptor({
      parse:(raw,{settings})=>{const text=String(raw ?? '').trim();if(!text)return null;const sep=metadataRegionalSettings(settings).decimalSeparator;const normalized=sep===','?text.replace(',','.'):text;if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized))throw new Error(`forventet desimaltall med ${sep==='.'?'punktum':'komma'}`);const number=Number(normalized);if(!Number.isFinite(number))throw new Error('ugyldig desimaltall');return number;},
      normalize:value=>value,
      format:(value,settings)=>{if(value==null)return '';const text=String(value);return metadataRegionalSettings(settings).decimalSeparator===','?text.replace('.',','):text;},
      renderEdit:(parent,{value,settings})=>metadataTextInput(parent,value==null?'':(metadataRegionalSettings(settings).decimalSeparator===','?String(value).replace('.',','):String(value)))
    }),
    boolean:metadataMakeDescriptor({
      parse:raw=>!!raw,
      normalize:value=>!!value,
      format:(value,settings)=>value==null?'':(value?String(settings?.uiBooleanLabels?.yes || 'Yes'):String(settings?.uiBooleanLabels?.no || 'No')),
      renderEdit:(parent,{value})=>{const input=parent.createEl('input',{type:'checkbox'});input.checked=value===true;return {inputEl:input,readRaw:()=>input.checked};}
    }),
    select:metadataMakeDescriptor({
      parse:raw=>{const text=String(raw ?? '').trim();return text||null;},
      normalize:value=>value,
      format:(value,_settings,field)=>value==null?'':metadataSelectOptionLabel(field,value),
      renderEdit:(parent,{value,field})=>{
        const select=parent.createEl('select');
        const blank=select.createEl('option',{text:'—'}); blank.value='';
        for(const option of field?.config?.options || []){
          if(option?.active===false && option?.value!==value) continue;
          const el=select.createEl('option',{text:String(option?.label || option?.value || '')});
          el.value=String(option?.value || '');
        }
        select.value=value==null?'':String(value);
        return {inputEl:select,readRaw:()=>select.value};
      }
    }),
    multiselect:metadataMakeDescriptor({
      parse:raw=>Array.isArray(raw)?raw.map(String):[],
      normalize:value=>value,
      format:(value,_settings,field)=>Array.isArray(value)&&value.length?value.map(item=>metadataSelectOptionLabel(field,item)).join(', '):'',
      renderEdit:(parent,{value,field})=>{
        const select=parent.createEl('select'); select.multiple=true; select.size=Math.min(6,Math.max(3,(field?.config?.options || []).length || 3));
        const selected=new Set(Array.isArray(value)?value:[]);
        for(const option of field?.config?.options || []){
          if(option?.active===false && !selected.has(option?.value)) continue;
          const el=select.createEl('option',{text:String(option?.label || option?.value || '')});
          el.value=String(option?.value || ''); el.selected=selected.has(option?.value);
        }
        return {inputEl:select,readRaw:()=>Array.from(select.selectedOptions || []).map(option=>option.value)};
      }
    }),
    link:metadataMakeDescriptor({
      parse:raw=>{const text=String(raw ?? '').trim();return text||null;},
      normalize:value=>value,
      format:value=>value==null?'':String(value),
      renderEdit:(parent,{value,field})=>metadataTextInput(parent,value,field?.config?.kind==='url'?'https://…':'[[note]]')
    })
  };
  return Object.freeze({
    contractVersion:METADATA_FIELD_TYPE_REGISTRY_CONTRACT_VERSION,
    types:Object.freeze({...descriptors}),
    get(type){return descriptors[String(type || '')] || null;},
    parseNormalizeValidate(field,raw,settings){
      const descriptor=descriptors[String(field?.type || '')];
      if(!descriptor) return {ok:false,value:null,errors:[`ukjent felttype ${String(field?.type || '')}`]};
      try {
        const parsed=descriptor.parse(raw,{field,settings});
        const normalized=descriptor.normalize(parsed,{field,settings});
        const validation=descriptor.validate(field,normalized);
        return validation.ok?{ok:true,value:descriptor.serialize(normalized),errors:[]}:{ok:false,value:null,errors:validation.errors};
      } catch(error) {
        return {ok:false,value:null,errors:[error instanceof Error?error.message:String(error)]};
      }
    },
    format(field,value,settings){
      const descriptor=descriptors[String(field?.type || '')];
      return descriptor?descriptor.format(value,settings,field):String(value ?? '');
    }
  });
}

const metadataFieldTypeRegistry=createMetadataFieldTypeRegistry();

module.exports={
  METADATA_FIELD_TYPE_REGISTRY_CONTRACT_VERSION,
  metadataRegionalSettings,
  metadataPresentationSettings,
  metadataParseDateParts,
  metadataNormalizeDateParts,
  metadataFormatDate,
  metadataParseTimeParts,
  metadataNormalizeTimeParts,
  metadataFormatTime,
  metadataValidateFieldValue,
  createMetadataFieldTypeRegistry,
  metadataFieldTypeRegistry
};
