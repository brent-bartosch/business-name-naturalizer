import { createClient } from '@supabase/supabase-js';
import { naturalizeNames } from './src/services/openrouter.js';

const supabaseUrl = 'https://tovzwoxswfevywzutgsp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function minimalTest() {
  console.log('🧪 Running minimal test...');
  
  try {
    // Step 1: Get one record
    console.log('1. Getting one record...');
    const { data, error } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name')
      .is('natural_name', null)
      .not('google_name', 'is', null)
      .limit(1);
    
    if (error) {
      console.error('❌ Query failed:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('ℹ️  No records found');
      return;
    }
    
    const record = data[0];
    console.log('✅ Found record:', record);
    
    // Step 2: Test naturalization
    console.log('2. Testing naturalization...');
    const naturalNames = await naturalizeNames([record.google_name]);
    console.log('✅ Naturalized:', record.google_name, '→', naturalNames[0]);
    
    // Step 3: Update the record
    console.log('3. Updating record...');
    const { error: updateError } = await supabase
      .from('outbound_email_targets')
      .update({ natural_name: naturalNames[0] })
      .eq('place_id', record.place_id);
    
    if (updateError) {
      console.error('❌ Update failed:', updateError);
      return;
    }
    
    console.log('✅ Update successful!');
    
    // Step 4: Verify the update
    console.log('4. Verifying update...');
    const { data: verified, error: verifyError } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name, natural_name')
      .eq('place_id', record.place_id)
      .single();
    
    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
      return;
    }
    
    console.log('✅ Verification successful:', verified);
    console.log('🎉 Complete success! The naturalization is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

export default minimalTest;