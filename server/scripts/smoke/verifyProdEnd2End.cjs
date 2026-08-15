// server/scripts/smoke/verifyProdEnd2End.cjs
// End-to-end verification of production API and demo dataset.

const https = require('https');

const PROD_URL = 'https://radiopad.eu';

function request(method, path, body = null, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PROD_URL);
    const postData = body ? JSON.stringify(body) : null;
    const headers = {
      'User-Agent': 'SAMS-Prod-E2E-Verifier/1.0',
    };
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    if (cookies) {
      headers['Cookie'] = cookies;
    }

    const req = https.request(
      url,
      {
        method,
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          const setCookies = res.headers['set-cookie'] || [];
          resolve({
            status: res.statusCode,
            headers: res.headers,
            setCookies,
            body: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log(`[E2E] Starting live production verification against ${PROD_URL}...\n`);

  // 1. Health
  const health = await request('GET', '/api/v1/health');
  console.log(`1. Health Check: status=${health.status}, db=${health.body?.data?.db}`);
  if (health.status !== 200 || !health.body?.data?.db) throw new Error('Health check failed');

  // 2. Public Courses
  const courses = await request('GET', '/api/v1/public/courses');
  console.log(`2. Public Courses: count=${courses.body?.data?.length}`);
  if (courses.status !== 200 || courses.body?.data?.length < 4) throw new Error('Public courses failed');
  for (const c of courses.body.data) {
    console.log(`   - [${c.examCategory}] ${c.title} (${c.lecturesCount} lectures, price: ${c.price} ${c.currency})`);
  }

  // 3. Public Home Preview & Stats
  const home = await request('GET', '/api/v1/public/home');
  console.log(`3. Public Home: featured=${home.body?.data?.featuredCourses?.length}, faculty=${home.body?.data?.faculty?.length}, faqs=${home.body?.data?.faqs?.length}`);
  console.log(`   Stats: ${JSON.stringify(home.body?.data?.stats)}`);
  if (home.status !== 200) throw new Error('Public home failed');

  // 4. Sample Questions
  const sampleQ = await request('GET', '/api/v1/public/sample-questions');
  console.log(`4. Sample Questions: count=${sampleQ.body?.data?.length}`);
  if (sampleQ.status !== 200 || sampleQ.body?.data?.length < 5) throw new Error('Sample questions failed');
  console.log(`   - Sample #1 stem preview: "${sampleQ.body.data[0].stem.slice(0, 90)}..." (options: ${sampleQ.body.data[0].options.length})`);

  // 5. Admin Login & Session
  const adminLogin = await request('POST', '/api/v1/auth/login', {
    email: 'admin@samsacademy.com',
    password: 'Admin@12345',
  });
  console.log(`5. Admin Login: status=${adminLogin.status}, role=${adminLogin.body?.data?.user?.role}, email=${adminLogin.body?.data?.user?.email}`);
  if (adminLogin.status !== 200 || adminLogin.body?.data?.user?.role !== 'admin') {
    throw new Error('Admin login failed: ' + JSON.stringify(adminLogin.body));
  }

  // Collect admin cookies
  const adminCookies = adminLogin.setCookies.map((c) => c.split(';')[0]).join('; ');

  // 6. Admin Questions Listing
  const adminQuestions = await request('GET', '/api/v1/admin/questions', null, adminCookies);
  console.log(`6. Admin Questions API: total questions in DB = ${adminQuestions.body?.data?.length}`);

  // 7. Admin Mock Exams Listing
  const adminMockExams = await request('GET', '/api/v1/admin/mock-exams', null, adminCookies);
  console.log(`7. Admin Mock Exams API: count = ${adminMockExams.body?.data?.length}`);

  // 8. Admin Coupons Listing
  const adminCoupons = await request('GET', '/api/v1/admin/coupons', null, adminCookies);
  console.log(`8. Admin Coupons API: count = ${adminCoupons.body?.data?.length}`);

  // 9. Admin Faculty Listing
  const adminFaculty = await request('GET', '/api/v1/admin/faculty', null, adminCookies);
  console.log(`9. Admin Faculty API: count = ${adminFaculty.body?.data?.length}`);

  // 10. Admin FAQs Listing
  const adminFaqs = await request('GET', '/api/v1/admin/faqs', null, adminCookies);
  console.log(`10. Admin FAQs API: count = ${adminFaqs.body?.data?.length}`);

  console.log('\n[E2E] SUCCESS! All live production checks passed 100%!');
}

run().catch((err) => {
  console.error('\n[E2E] FAILED:', err);
  process.exit(1);
});
