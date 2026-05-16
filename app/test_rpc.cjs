const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
if(urlMatch && keyMatch) {
  const url = urlMatch[1].trim().replace(/['"]/g, '');
  const key = keyMatch[1].trim().replace(/['"]/g, '');

  fetch(url + '/rest/v1/rpc/get_today_chores', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify({ p_member_id: 1 })
  }).then(res => res.json()).then(data => {
    if (data.length > 0) {
      console.log('Keys returned:', Object.keys(data[0]));
    } else {
      console.log('No chores returned for member 1 or error:', data);
    }
  }).catch(console.error);
}
