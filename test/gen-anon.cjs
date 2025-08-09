// gen-anon.cjs
const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Set JWT_SECRET in your env');
  process.exit(1);
}
// 10-year token for dev
const token = jwt.sign(
  { role: 'anon', iss: 'supabase' },
  secret,
  { algorithm: 'HS256', expiresIn: '10y' }
);
console.log(token);
