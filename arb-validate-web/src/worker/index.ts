import { prisma } from '../lib/db';
import { fetchAndSaveSnapshot } from '../lib/services/snapshot';
import { evaluateOpportunity } from '../lib/services/engine/evaluator';

let isRunning = false;
let currentPollInterval = 15;

async function updateStatus(data: any) {
  // Update system status
  await prisma.systemStatus.upsert({
    where: { id: 1 },
    update: data,
    create: data
  });
}

async function runTask() {
  if (isRunning) return;
  isRunning = true;

  // Create Scan Run
  let runId: number | null = null;

  try {
    // Check enabled status
    const settings = await prisma.settings.findFirst();
    if (!settings?.task_enabled) {
      isRunning = false;
      return;
    }

    // Update poll interval if changed
    if (settings.poll_interval_sec !== currentPollInterval) {
        currentPollInterval = settings.poll_interval_sec;
        console.log(`[Worker] Updating poll interval to ${currentPollInterval}s`);
    }

    console.log('--- [Worker] Starting Poll Cycle ---');
    
    // Create ScanRun record
    const scanRun = await prisma.scanRun.create({
        data: { status: 'running' }
    });
    runId = scanRun.id;

    await updateStatus({ last_scan_at: new Date() });
    
    // 1. Get verified pairs
    const pairs = await prisma.pair.findMany({
      where: { status: 'verified' },
    });

    console.log(`[Worker] Found ${pairs.length} verified pairs`);
    await updateStatus({ pairs_scanned: pairs.length });

    let pmOk = 0, pmFail = 0, khOk = 0, khFail = 0;
    let evalCount = 0;

    for (const pair of pairs) {
      try {
        // 2. Fetch Snapshot
        const result = await fetchAndSaveSnapshot(pair.id);
        
        if (result && result.snapshot) {
            // Update OK counts based on HTTP status in debug
            if (result.debug.pm.http_status === 200 && result.debug.pm.error_code === undefined) pmOk++; else pmFail++;
            if (result.debug.kh.http_status === 200 && result.debug.kh.error_code === undefined) khOk++; else khFail++;
            
            // 3. Evaluate Opportunity
            await evaluateOpportunity(result.snapshot, result.debug);
            evalCount++;
        } else {
            // If null, it failed somewhere
            pmFail++; 
            khFail++; 
        }
      } catch (e: any) {
          console.error(`Error processing pair ${pair.id}:`, e);
          pmFail++;
          khFail++;
          await updateStatus({ last_error: `Pair ${pair.id}: ${e.message}` });
      }
    }
    
    // Get total opportunities found in this run? Or total ever?
    // SystemStatus usually shows cumulative or latest snapshot state.
    // Let's update aggregate counts from DB for accuracy
    const totalEvals = await prisma.evaluation.count();
    const totalOpps = await prisma.opportunity.count();

    await updateStatus({
        pm_ok_count: pmOk,
        pm_fail_count: pmFail,
        kh_ok_count: khOk,
        kh_fail_count: khFail,
        eval_count: totalEvals,
        opportunity_count: totalOpps
    });

    // Close ScanRun
    await prisma.scanRun.update({
        where: { id: runId },
        data: { 
            status: 'completed', 
            completed_at: new Date(),
            pairs_processed: pairs.length
        }
    });
    
    console.log('--- [Worker] Cycle Complete ---');
  } catch (e: any) {
      console.error('[Worker] Fatal Cycle Error:', e);
      await updateStatus({ last_error: `Fatal: ${e.message}` });
      
      if (runId) {
          await prisma.scanRun.update({
              where: { id: runId },
              data: { status: 'failed', error: e.message, completed_at: new Date() }
          });
      }
  } finally {
      isRunning = false;
  }
}

// Main Loop
async function startWorker() {
    console.log('🚀 Worker started. Waiting for enabled signal...');
    
    const loop = async () => {
        try {
            const settings = await prisma.settings.findFirst();
            if (settings?.task_enabled) {
                await runTask();
            }
            
            const delay = settings?.task_enabled 
                ? (settings.poll_interval_sec || 15) * 1000 
                : 3000;
                
            setTimeout(loop, delay);
        } catch (e) {
            console.error('[Worker] Loop Error:', e);
            setTimeout(loop, 5000);
        }
    };
    
    // Init status row
    await updateStatus({ last_error: null });
    
    loop();
}

startWorker();
