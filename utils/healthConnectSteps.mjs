// Provider-injected adapter: never sum raw samples from overlapping devices.
export async function readAndroidSteps(sdk, date) {
  const status = await sdk.getSdkStatus();
  if (status !== sdk.SdkAvailabilityStatus.SDK_AVAILABLE) {
    return {available:false, permission:'denied', steps:null,
      error:status === sdk.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
        ? 'Install or update Health Connect to connect your steps.'
        : 'Health Connect is not available on this device.'};
  }
  if (!await sdk.initialize()) return {available:false,permission:'denied',steps:null,error:'Health Connect could not be initialized. Try again or open Health Connect settings.'};
  const permissions = await sdk.getGrantedPermissions();
  if (!permissions.some(p=>p.recordType==='Steps' && p.accessType==='read'))
    return {available:true,permission:'not_determined',steps:null,error:'Allow Steps in Health Connect to show your daily steps.'};
  const start=new Date(date);start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);
  const result=await sdk.aggregateRecord({recordType:'Steps',timeRangeFilter:{operator:'between',startTime:start.toISOString(),endTime:end.toISOString()}});
  const total=result?.COUNT_TOTAL ?? 0;
  if (!Number.isFinite(total) || total<0) throw new Error('Health Connect returned an invalid step total.');
  return {available:true,permission:'granted',steps:Math.min(50000,Math.round(total))};
}
