import supabase from './src/db/client.js';

async function testSimpleQuery() {
  console.log('Testing simple query without any joins...');
  
  try {
    // Test 1: Very basic query
    console.log('\n1. Testing basic select...');
    const { data: test1, error: error1 } = await supabase
      .from('outbound_email_targets')
      .select('place_id')
      .limit(1);
    
    if (error1) {
      console.error('❌ Basic select failed:', error1);
      return;
    }
    console.log('✅ Basic select works:', test1?.length, 'records');
    
    // Test 2: Query with where clause
    console.log('\n2. Testing with WHERE clause...');
    const { data: test2, error: error2 } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name')
      .is('natural_name', null)
      .limit(2);
    
    if (error2) {
      console.error('❌ WHERE query failed:', error2);
      return;
    }
    console.log('✅ WHERE query works:', test2?.length, 'records');
    console.log('Sample data:', test2);
    
    // Test 3: Test the exact query from getRecordsToProcess
    console.log('\n3. Testing exact query from getRecordsToProcess...');
    const { data: test3, error: error3 } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name')
      .is('natural_name', null)
      .not('google_name', 'is', null)
      .limit(3);
    
    if (error3) {
      console.error('❌ Exact query failed:', error3);
      return;
    }
    console.log('✅ Exact query works:', test3?.length, 'records');
    console.log('Sample data:', test3);
    
    console.log('\n🎉 All queries successful! The issue might be elsewhere.');
    
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

testSimpleQuery().catch(console.error);