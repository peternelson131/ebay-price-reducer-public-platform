#!/usr/bin/env node

/**
 * Check Database Migration Status
 * This script checks if the listings table exists with required columns
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkDatabaseMigration() {
  console.log('\n🔍 Checking Database Migration Status...\n');

  try {
    // Step 1: Check if listings table exists
    console.log('1️⃣ Checking if listings table exists...');
    const { error: tableError } = await supabase
      .from('listings')
      .select('id')
      .limit(1);

    if (tableError) {
      if (tableError.message.includes('does not exist') || tableError.code === '42P01') {
        console.log('\n📋 MIGRATION STATUS: ❌ NOT RUN');
        console.log('\n❌ The listings table does NOT exist in the database');
        console.log('\n📝 REQUIRED ACTIONS:');
        console.log('1. Run the base schema migration: supabase-listings-schema.sql');
        console.log('2. Run the view/watch counts migration: add-listing-view-watch-counts.sql');
        console.log('\n💡 You can run these in the Supabase Dashboard > SQL Editor');
        return;
      }
      console.error('❌ Error checking table:', tableError.message);
      return;
    }

    console.log('   ✅ Listings table exists');

    // Step 2: Check for required columns
    console.log('\n2️⃣ Checking for required columns...');
    const requiredColumns = ['view_count', 'watch_count', 'hit_count', 'last_synced_at'];

    const { data: testData, error: testError } = await supabase
      .from('listings')
      .select('id, view_count, watch_count, hit_count, last_synced_at')
      .limit(1);

    if (testError) {
      if (testError.message.includes('column') && testError.message.includes('does not exist')) {
        const missingColumn = testError.message.match(/column "(\w+)" does not exist/);
        console.log('\n📋 MIGRATION STATUS: ❌ INCOMPLETE');
        console.log(`\n❌ Missing column: ${missingColumn ? missingColumn[1] : 'unknown'}`);
        console.log(`   Error message: ${testError.message}`);
        console.log('\n📝 REQUIRED ACTIONS:');
        console.log('1. Run the migration file: add-listing-view-watch-counts.sql');
        console.log('   This will add: view_count, watch_count, hit_count, last_synced_at');
        console.log('\n💡 You can run this in the Supabase Dashboard > SQL Editor');
        console.log('   File location: /Users/peternelson/Projects/ebay-price-reducer/add-listing-view-watch-counts.sql');
        return;
      } else {
        console.error('❌ Error testing columns:', testError.message);
        console.error('   Error code:', testError.code);
        console.error('   Full error:', JSON.stringify(testError, null, 2));
        return;
      }
    }

    console.log('\n📋 MIGRATION STATUS: ✅ COMPLETE');
    console.log('\n✅ All required columns exist:');
    requiredColumns.forEach(col => {
      console.log(`   ✓ ${col}`);
    });

    // Step 3: Check database statistics
    console.log('\n3️⃣ Checking database statistics...');
    const { count, error: countError } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      console.log(`   Total listings: ${count || 0}`);
    }

    // Step 4: Test that new columns can be queried with values
    const { data: sampleData, error: sampleError } = await supabase
      .from('listings')
      .select('id, view_count, watch_count, hit_count, last_synced_at')
      .limit(3);

    if (!sampleError && sampleData && sampleData.length > 0) {
      console.log('\n4️⃣ Sample data from new columns:');
      sampleData.forEach((item, idx) => {
        console.log(`   Listing ${idx + 1}:`);
        console.log(`      view_count: ${item.view_count ?? 0}`);
        console.log(`      watch_count: ${item.watch_count ?? 0}`);
        console.log(`      hit_count: ${item.hit_count ?? 0}`);
        console.log(`      last_synced_at: ${item.last_synced_at ?? 'null'}`);
      });
    }

    console.log('\n✅ Database is ready for use!');
    console.log('\n📊 SUMMARY:');
    console.log('   ✓ Listings table exists');
    console.log('   ✓ Required columns present (view_count, watch_count, hit_count, last_synced_at)');
    console.log('   ✓ Indexes and triggers should be in place');
    console.log('   ✓ Ready to sync eBay listing data');

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    console.log('\n📝 Manual verification recommended');
    console.log('   - Check Supabase dashboard: Table Editor > listings');
    console.log('   - Verify columns: view_count, watch_count, hit_count, last_synced_at');
  }
}

// Run the check
checkDatabaseMigration()
  .then(() => {
    console.log('\n✨ Check complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
