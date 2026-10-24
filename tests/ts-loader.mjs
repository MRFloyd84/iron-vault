// Resolve the app's bundler-style local TypeScript imports in Node's test runner.
export async function resolve(specifier,context,nextResolve){
 try{return await nextResolve(specifier,context);}
 catch(error){
  if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return nextResolve(specifier+'.ts',context);
  throw error;
 }
}
