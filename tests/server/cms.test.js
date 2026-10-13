import {test} from 'node:test';
import assert from 'node:assert/strict';
import seed from '../../shared/seed.json' with {type:'json'};
import {parseContent} from '../../server/cms/schema.js';
import {seoFor,seoHead,safeJson,initialMarkup} from '../../shared/seo.js';
import {documentBlocks, guestPath, guestPageIds} from '../../shared/guest-pages.js';
import {withGuestPages, withJournal} from '../../server/cms/migrations.js';
import {journalPostIds, journalPosts, readingMinutes} from '../../shared/journal.js';
import {publicContent,linkTo,resolveRoute} from '../../shared/content.js';
import {passwordHash,verifyPassword} from '../../server/cms/auth.js';
test('content validation rejects reserved, duplicate and unsafe URL input',()=>{
 assert.equal(parseContent(seed).rooms.length,12);
 for(const mutate of [c=>{c.pages[1].slug='admin'},c=>{c.rooms[1].slug=c.rooms[0].slug},c=>{c.settings.maps='javascript:alert(1)'},c=>{c.settings.siteUrl='not a URL'},c=>{c.rooms[0].images=['../.env']},c=>{c.pages[0].status='draft'},c=>{c.pages[1].slug='same';c.pages[2].slug='same'}]){const c=structuredClone(seed);mutate(c);assert.throws(()=>parseContent(c),e=>e.status===400);}
});
test('published content filters drafts and resolves edited slugs consistently',()=>{
 const c=structuredClone(seed);c.pages.find(p=>p.template==='rooms').slug='luxury-stays';c.rooms[0].slug='green-villa';c.rooms[1].status='draft';
 const pub=publicContent(c);assert.equal(pub.rooms.length,11);assert.equal(linkTo(pub,'/rooms/'+c.rooms[0].id),'/luxury-stays/green-villa');assert.equal(resolveRoute(pub,'/luxury-stays/green-villa').item.id,c.rooms[0].id);
});
test('server SEO escapes scripts and produces canonical metadata and noindex on 404',()=>{
 const c=publicContent(seed);c.settings.siteUrl='https://example.com';c.pages[0].seo.title='A <script>alert(1)</script> retreat';const seo=seoFor(c,'/','http://localhost:5174');assert.equal(seo.canonical,'https://example.com/');assert.doesNotMatch(seoHead(seo),/<script>alert/);assert.doesNotMatch(safeJson({x:'</script><script>alert(1)</script>'}),/<\/script>/);assert.equal(seoFor(c,'/not-a-page','https://example.com').noindex,true);
});
test('password hashing salts and verifies without storing the plaintext',async()=>{
 const password='test-only-long-password';const a=await passwordHash(password),b=await passwordHash(password);assert.notEqual(a,b);assert.ok(!a.includes(password));assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('incorrect-password',a),false);
});
test('guest page upgrade adds missing defaults without replacing edits or colliding with slugs',()=>{
 const old=structuredClone(seed);old.pages=old.pages.filter(p=>!guestPageIds.includes(p.id));old.copy['guest.privacyLink']='My privacy notice';old.settings.email='owner@example.test';
 old.pages.push({...structuredClone(seed.pages[0]),id:'existing-custom',slug:'privacy-policy',template:'custom',name:'Existing custom page'});
 const next=withGuestPages(old);assert.equal(next.pages.length,old.pages.length+5);assert.equal(next.pages.find(p=>p.id==='privacy-policy').slug,'privacy-policy-2');assert.equal(next.copy['guest.privacyLink'],'My privacy notice');assert.equal(next.settings.email,'owner@example.test');
 next.pages.find(p=>p.id==='privacy-policy').body='Owner-edited policy';assert.deepEqual(withGuestPages(next),next);assert.equal(old.pages.length,8);assert.doesNotThrow(()=>parseContent(next));
});
test('guest notices link to edited slugs, omit drafts and safely format contact tokens',()=>{
 const content=structuredClone(seed),page=content.pages.find(p=>p.id==='privacy-policy');page.slug='your-privacy';assert.equal(guestPath(content,page.id),'/your-privacy');page.status='draft';assert.equal(guestPath(content,page.id),null);
 const blocks=documentBlocks('## Your details\n\nEmail {{email}}\nfor help.\n\n- One\n- Two\n\n### Next\n<script>alert(1)</script>',{email:'team@example.test'});
 assert.equal(blocks[1].text,'Email team@example.test for help.');assert.deepEqual(blocks[2].items,['One','Two']);assert.equal(blocks[3].id,'section-2');
 page.status='published';page.body='## Safe heading\n\n<script>alert(1)</script>\n\nEmail {{email}}';const html=initialMarkup(content,resolveRoute(content,'/your-privacy'));
 assert.match(html,/<h2 id="section-1">Safe heading<\/h2>/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/\{\{email\}\}/);assert.match(html,/info@thenaturenestresort.com/);
});
test('journal upgrade enables Blog and preserves owner posts, SEO, slugs and drafts',()=>{
 const old=structuredClone(seed);old.posts=old.posts.filter(p=>!journalPostIds.includes(p.id));const blog=old.pages.find(p=>p.template==='blog');blog.nav=false;blog.slug='travel-notes';blog.heading='Owner heading';old.posts[0].body='Owner text';
 const next=withJournal(old);assert.equal(next.posts.length,4);assert.equal(next.posts[0].body,'Owner text');assert.equal(next.pages.find(p=>p.template==='blog').heading,'Owner heading');assert.equal(next.pages.find(p=>p.template==='blog').slug,'travel-notes');assert.ok(next.pages.find(p=>p.template==='blog').nav);assert.deepEqual(withJournal(next),next);assert.doesNotThrow(()=>parseContent(next));
 next.posts[1].status='draft';assert.equal(journalPosts(next).length,3);assert.equal(readingMinutes('one '.repeat(401)),3);assert.equal(readingMinutes(''),1);
 const route=resolveRoute(publicContent(next),'/travel-notes/'+next.posts[2].slug);const html=initialMarkup(next,route);assert.match(html,/<h2 id="section-1">Start with your people<\/h2>/);assert.equal(seoFor(next,route.path,'https://example.com').schemas[0]['@type'],'BlogPosting');
});
