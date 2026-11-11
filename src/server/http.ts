import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { database } from './db';
import { Auth, authConfig } from './auth';
import { productionProblems, publicOrigins, sessionDays } from './config';
import { Service } from './service';
import { demand, Problem } from './validation';
const COOKIE='onstage_session';
function response(data:unknown,status=200,token?:string) {
  const r=NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if(token) r.cookies.set(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:sessionDays()*86400});
  return r;
}
const num = (s: string) => { const n = Number(s); demand(Number.isInteger(n) && n > 0, 404, 'NOT_FOUND', '版本不存在'); return n; };
export async function handle(request:NextRequest,parts:string[]) {
  try {
    const path=parts.join('/'),method=request.method;
    // 健康检查：托管平台用它判断服务是否正常。只返回是否可用，不返回任何数据。
    if(method==='GET' && path==='health') {
      const problems=productionProblems();
      if(problems.length) { console.error('配置错误：'+problems.join('；')); return response({ok:false,error:'服务配置不完整，请查看服务器日志'},503); }
      database().get('SELECT 1'); return response({ok:true});
    }
    const problems=productionProblems(); demand(!problems.length,503,'CONFIG','服务配置不完整，暂时无法使用。');
    const db=database(),auth=new Auth(db),service=new Service(db); const token=request.cookies.get(COOKIE)?.value;
    if(method==='GET') {
      if(path==='session') {
        auth.maintenance();
        let identity=auth.read(token); let newToken:string|undefined;
        if(!identity) { const session=auth.issue(); identity=session.identity; newToken=session.token; }
        else if(auth.renew(token)) newToken=token; // 续期：重新下发同一个 cookie，延长浏览器端有效期
        let loginAvailable=true,mock=false; try {mock=authConfig()==='mock';} catch {loginAvailable=false;}
        return response({identity,mock,loginAvailable,sessionDays:sessionDays()},200,newToken);
      }
      if(path==='content') return response(service.list(request.nextUrl.searchParams.get('kind')||undefined));
      if(parts[0]==='content' && parts.length===2) return response(service.publicContent(parts[1]));
      const ctx=auth.guard(token,request.headers.get('x-session'));
      if(parts[0]==='experiences' && parts[2]==='guide') return response(service.guide(ctx,parts[1]));
      if(path==='mine') return response(service.mine(ctx));
      if(parts[0]==='drafts' && parts.length===2) return response(service.draft(ctx,parts[1]));
      if(parts[0]==='records' && parts.length===2) return response(service.record(ctx,parts[1]));
      if(path==='admin') return response(service.adminData(ctx));
      if(parts[0]==='admin' && parts[1]==='experiences' && parts[3]==='versions') return response(service.versions(ctx,parts[2]));
    } else {
      demand(method==='POST',405,'METHOD','不支持的操作');
      demand(publicOrigins().includes(request.headers.get('origin') || ''),403,'ORIGIN','请求来源无效，请从网站页面重试');
      demand(request.headers.get('content-type')?.includes('application/json'),415,'CONTENT_TYPE','请求格式不正确');
      const raw=await request.text(); demand(Buffer.byteLength(raw)<500000,413,'TOO_LARGE','内容过长，请缩短后重试');
      let body:unknown; try {body=JSON.parse(raw);} catch {throw new Problem(400,'JSON','请求格式不正确');}
      const ctx=auth.guard(token,request.headers.get('x-session'));
      if(path==='auth/code') { const b=z.object({phone:z.string()}).parse(body); return response(await auth.send(b.phone,ctx.owner)); }
      if(path==='auth/login') { const b=z.object({phone:z.string(),code:z.string()}).parse(body); const s=auth.verify(b.phone,b.code,ctx,token!); return response({identity:s.identity,merge:s.merge},200,s.token); }
      if(path==='auth/link') { auth.throttle('link:'+ctx.owner,10,3600000); const b=z.object({token:z.string()}).parse(body); const s=auth.useAdminLink(b.token,ctx,token!); return response({identity:s.identity},200,s.token); }
      // 每个访客的写入次数上限（自动保存约每秒 1 次，正常使用远低于这个数），防止脚本刷写。
      auth.throttle('write:'+ctx.owner,240,60000);
      if(path==='auth/logout') { const s=auth.logout(token!); return response({identity:s.identity},200,s.token); }
      if(parts[0]==='drafts' && parts.length===2) return response(service.saveDraft(ctx,parts[1],body));
      if(parts[0]==='drafts' && parts[2]==='resolve') return response(service.resolveDraft(ctx,parts[1],body));
      if(parts[0]==='recoveries' && parts[2]==='restore') return response(service.restore(ctx,parts[1]));
      if(parts[0]==='recoveries' && parts[2]==='delete') return response(service.removeRecovery(ctx,parts[1]));
      if(parts[0]==='experiences' && parts[2]==='submit') return response(service.submit(ctx,parts[1],body));
      if(parts[0]==='favorites') {const b=z.object({on:z.boolean()}).parse(body);return response(service.favorite(ctx,parts[1],b.on));}
      if(parts[0]==='apply') {auth.throttle('click:'+ctx.owner,60,60000);return response(service.apply(ctx,parts[1]));}
      if(parts[0]==='reports') {auth.throttle('report:'+ctx.owner,10,3600000);return response(service.report(ctx,parts[1],body));}
      if(path==='cooperation') {auth.throttle('coop:'+ctx.owner,5,3600000);auth.throttle('coop:global',200,3600000);return response(service.cooperation(ctx,body));}
      if(path==='admin/content') return response(service.edit(ctx,body));
      if(parts[0]==='admin' && parts[1]==='content' && parts[3]==='transition') return response(service.transition(ctx,parts[2],body));
      if(parts[0]==='admin' && parts[1]==='reports') return response(service.resolveReport(ctx,parts[2],body));
      if(parts[0]==='admin' && parts[1]==='intents') return response(service.updateIntent(ctx,parts[2],body));
      if(parts[0]==='admin' && parts[1]==='experiences' && parts[3]==='versions') {
        if(parts.length===4) return response(service.createVersion(ctx,parts[2]));
        if(parts.length===5) return response(service.updateVersion(ctx,parts[2],num(parts[4]),body));
        if(parts[5]==='review') return response(service.reviewVersion(ctx,parts[2],num(parts[4]),body));
        if(parts[5]==='publish') return response(service.publishVersion(ctx,parts[2],num(parts[4])));
      }
    }
    throw new Problem(404,'NOT_FOUND','接口不存在');
  } catch(e) {
    if(e instanceof Problem) return response({error:e.message,code:e.code,detail:e.detail},e.status);
    if(e instanceof ZodError) return response({error:'填写内容不符合要求：'+[...new Set(e.issues.map(i=>i.message))].slice(0,3).join('；'),code:'VALIDATION',fields:e.issues.map(i=>({path:i.path.join('.'),message:i.message}))},422);
    console.error('Request failed',e instanceof Error?e.message:'unknown');
    return response({error:'暂时无法完成操作，请保留内容并重试',code:'INTERNAL'},500);
  }
}
