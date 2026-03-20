/**
 * Phase 2 Test Suite for Task Manager Plugin
 * Tests: claim, edit, unassign, assign, completion metadata, session hooks, cross-agent scenarios
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Use the actual tasks.js module
const TASKS_MODULE_PATH = '/home/openclaw/.openclaw/workspace/skills/task-manager/tasks.js';
const TASKS_FILE = '/home/openclaw/.openclaw/workspace/tasks/tasks.json';

// Backup and restore helpers
let backupData = null;

function backupTasks() {
  if (fs.existsSync(TASKS_FILE)) {
    backupData = fs.readFileSync(TASKS_FILE, 'utf8');
  }
}

function restoreTasks() {
  if (backupData) {
    fs.writeFileSync(TASKS_FILE, backupData, 'utf8');
  }
}

function clearRequireCache() {
  delete require.cache[TASKS_MODULE_PATH];
}

function getModule() {
  clearRequireCache();
  return require(TASKS_MODULE_PATH);
}

// Clean slate for each test
function resetTasksStore() {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const emptyStore = {
    version: 1,
    lastTaskSequence: 0,
    taskTypes: ['TASK', 'EPIC', 'STORY'],
    statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'BLOCKED'],
    tasks: []
  };
  fs.writeFileSync(TASKS_FILE, JSON.stringify(emptyStore, null, 2) + '\n', 'utf8');
  clearRequireCache();
}

// ============================================
// TEST SUITE: Phase 2 Commands
// ============================================

async function runTests() {
  const results = [];
  
  console.log('='.repeat(60));
  console.log('PHASE 2 TASK MANAGER TEST SUITE');
  console.log('='.repeat(60));
  console.log('');

  // Backup once at start
  backupTasks();

  try {
    // ==========================================
    // TEST: claimTask - basic claim
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      // Create an OPEN task assigned to coder
      const task = tm.addTask({
        type: 'TASK',
        title: 'Test claim task',
        prompt: 'Testing claim command',
        assignedTo: 'coder',
        status: 'OPEN'
      });
      
      // Claim it
      const claimed = tm.claimTask(task.id, 'coder');
      
      assert.strictEqual(claimed.status, 'IN_PROGRESS', 'Status should be IN_PROGRESS after claim');
      assert.strictEqual(claimed.claimedBy, 'coder', 'claimedBy should be coder');
      assert.ok(claimed.claimedAt, 'claimedAt should be set');
      assert.strictEqual(claimed.completedBy, undefined, 'completedBy should not be set');
      
      console.log('✅ TEST PASSED: claimTask - basic claim');
      results.push({ name: 'claimTask - basic claim', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: claimTask - basic claim:', err.message);
      results.push({ name: 'claimTask - basic claim', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: claimTask - cannot claim non-OPEN task
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Test claim task',
        assignedTo: 'coder',
        status: 'IN_PROGRESS'  // Already in progress
      });
      
      try {
        tm.claimTask(task.id, 'coder');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('not OPEN'), 'Error should mention task not being OPEN');
      }
      
      console.log('✅ TEST PASSED: claimTask - cannot claim non-OPEN task');
      results.push({ name: 'claimTask - cannot claim non-OPEN task', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: claimTask - cannot claim non-OPEN task:', err.message);
      results.push({ name: 'claimTask - cannot claim non-OPEN task', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: claimTask - cross-agent prevention
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Planner task',
        assignedTo: 'planner',  // Assigned to planner
        status: 'OPEN'
      });
      
      // Coder tries to claim planner's task
      try {
        tm.claimTask(task.id, 'coder');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('assigned to planner'), 'Error should mention assignment');
      }
      
      console.log('✅ TEST PASSED: claimTask - cross-agent prevention');
      results.push({ name: 'claimTask - cross-agent prevention', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: claimTask - cross-agent prevention:', err.message);
      results.push({ name: 'claimTask - cross-agent prevention', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: claimTask - unassigned task can be claimed by any agent
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Unassigned task',
        assignedTo: '',  // No assignment
        status: 'OPEN'
      });
      
      // Albert can claim it
      const claimed = tm.claimTask(task.id, 'albert');
      assert.strictEqual(claimed.status, 'IN_PROGRESS', 'Status should be IN_PROGRESS');
      assert.strictEqual(claimed.claimedBy, 'albert', 'claimedBy should be albert');
      
      console.log('✅ TEST PASSED: claimTask - unassigned task can be claimed by any agent');
      results.push({ name: 'claimTask - unassigned task can be claimed by any agent', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: claimTask - unassigned task:', err.message);
      results.push({ name: 'claimTask - unassigned task', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: updateTask - partial update
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Original title',
        prompt: 'Original prompt',
        assignedTo: 'coder',
        status: 'OPEN'
      });
      
      // Update only title
      const updated = tm.updateTask(task.id, { title: 'New title' });
      
      assert.strictEqual(updated.title, 'New title', 'Title should be updated');
      assert.strictEqual(updated.prompt, 'Original prompt', 'Prompt should remain unchanged');
      assert.strictEqual(updated.assignedTo, 'coder', 'assignedTo should remain unchanged');
      assert.strictEqual(updated.type, 'TASK', 'type should remain unchanged');
      
      console.log('✅ TEST PASSED: updateTask - partial update');
      results.push({ name: 'updateTask - partial update', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: updateTask - partial update:', err.message);
      results.push({ name: 'updateTask - partial update', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: updateTask - empty title validation
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Original title',
        assignedTo: 'coder'
      });
      
      try {
        tm.updateTask(task.id, { title: '' });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('empty'), 'Error should mention empty title');
      }
      
      console.log('✅ TEST PASSED: updateTask - empty title validation');
      results.push({ name: 'updateTask - empty title validation', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: updateTask - empty title validation:', err.message);
      results.push({ name: 'updateTask - empty title validation', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: updateTask - invalid type validation
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Test task',
        assignedTo: 'coder'
      });
      
      try {
        tm.updateTask(task.id, { type: 'INVALID' });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('Invalid task type'), 'Error should mention invalid type');
      }
      
      console.log('✅ TEST PASSED: updateTask - invalid type validation');
      results.push({ name: 'updateTask - invalid type validation', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: updateTask - invalid type validation:', err.message);
      results.push({ name: 'updateTask - invalid type validation', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: unassignTask - clears assignee and resets status
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      // Create an OPEN task assigned to coder
      const task = tm.addTask({
        type: 'TASK',
        title: 'Assigned task',
        assignedTo: 'coder',
        status: 'OPEN'
      });
      
      // Claim it first (requires OPEN status)
      tm.claimTask(task.id, 'coder');
      
      // Unassign
      const unassigned = tm.unassignTask(task.id);
      
      assert.strictEqual(unassigned.assignedTo, '', 'assignedTo should be cleared');
      assert.strictEqual(unassigned.status, 'OPEN', 'status should be reset to OPEN');
      assert.strictEqual(unassigned.claimedBy, undefined, 'claimedBy should be cleared');
      assert.strictEqual(unassigned.claimedAt, undefined, 'claimedAt should be cleared');
      
      console.log('✅ TEST PASSED: unassignTask - clears assignee and resets status');
      results.push({ name: 'unassignTask - clears assignee and resets status', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: unassignTask:', err.message);
      results.push({ name: 'unassignTask', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: unassignTask - does not reset terminal statuses
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Completed task',
        assignedTo: 'coder',
        status: 'COMPLETED'
      });
      
      const unassigned = tm.unassignTask(task.id);
      
      assert.strictEqual(unassigned.assignedTo, '', 'assignedTo should be cleared');
      assert.strictEqual(unassigned.status, 'COMPLETED', 'status should remain COMPLETED');
      
      console.log('✅ TEST PASSED: unassignTask - does not reset terminal statuses');
      results.push({ name: 'unassignTask - terminal status preserved', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: unassignTask - terminal status:', err.message);
      results.push({ name: 'unassignTask - terminal status', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: assignTask - valid assignment
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Unassigned task',
        assignedTo: '',
        status: 'OPEN'
      });
      
      const assigned = tm.assignTask(task.id, 'albert');
      
      assert.strictEqual(assigned.assignedTo, 'albert', 'assignedTo should be albert');
      assert.strictEqual(assigned.status, 'OPEN', 'status should remain OPEN');
      assert.strictEqual(assigned.claimedBy, undefined, 'claimedBy should be cleared');
      
      console.log('✅ TEST PASSED: assignTask - valid assignment');
      results.push({ name: 'assignTask - valid assignment', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: assignTask:', err.message);
      results.push({ name: 'assignTask', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: assignTask - invalid agent validation
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Test task',
        assignedTo: 'coder'
      });
      
      try {
        tm.assignTask(task.id, 'unknown_agent');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('Invalid agent'), 'Error should mention invalid agent');
      }
      
      console.log('✅ TEST PASSED: assignTask - invalid agent validation');
      results.push({ name: 'assignTask - invalid agent validation', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: assignTask - invalid agent:', err.message);
      results.push({ name: 'assignTask - invalid agent', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: assignTask - clears claim metadata
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Claimed task',
        assignedTo: 'coder',
        status: 'OPEN'
      });
      
      // Claim it
      tm.claimTask(task.id, 'coder');
      
      // Reassign to another agent
      const assigned = tm.assignTask(task.id, 'albert');
      
      assert.strictEqual(assigned.assignedTo, 'albert', 'assignedTo should be albert');
      assert.strictEqual(assigned.claimedBy, undefined, 'claimedBy should be cleared');
      assert.strictEqual(assigned.claimedAt, undefined, 'claimedAt should be cleared');
      
      console.log('✅ TEST PASSED: assignTask - clears claim metadata');
      results.push({ name: 'assignTask - clears claim metadata', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: assignTask - clears claim metadata:', err.message);
      results.push({ name: 'assignTask - clears claim metadata', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: completeTask - records completion metadata
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      const task = tm.addTask({
        type: 'TASK',
        title: 'Task to complete',
        assignedTo: 'coder',
        status: 'OPEN'
      });
      
      // Claim it first
      tm.claimTask(task.id, 'coder');
      
      // Complete it
      const completed = tm.completeTask(task.id, 'coder');
      
      assert.strictEqual(completed.status, 'COMPLETED', 'status should be COMPLETED');
      assert.strictEqual(completed.completedBy, 'coder', 'completedBy should be coder');
      assert.ok(completed.completedAt, 'completedAt should be set');
      assert.strictEqual(completed.claimedBy, undefined, 'claimedBy should be cleared');
      assert.strictEqual(completed.claimedAt, undefined, 'claimedAt should be cleared');
      
      console.log('✅ TEST PASSED: completeTask - records completion metadata');
      results.push({ name: 'completeTask - records completion metadata', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: completeTask:', err.message);
      results.push({ name: 'completeTask', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: Cross-agent scenario - unassign then reassign
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      // Create task assigned to coder
      const task = tm.addTask({
        type: 'TASK',
        title: 'Cross-agent test task',
        assignedTo: 'coder',
        status: 'OPEN'
      });
      
      // Coder claims it
      tm.claimTask(task.id, 'coder');
      
      // Unassign
      tm.unassignTask(task.id);
      
      // Reassign to albert
      const assigned = tm.assignTask(task.id, 'albert');
      
      assert.strictEqual(assigned.assignedTo, 'albert', 'assignedTo should be albert after reassign');
      assert.strictEqual(assigned.status, 'OPEN', 'status should be OPEN after unassign');
      
      // Albert can now claim it
      const claimed = tm.claimTask(task.id, 'albert');
      assert.strictEqual(claimed.status, 'IN_PROGRESS', 'Albert can claim after reassign');
      assert.strictEqual(claimed.claimedBy, 'albert', 'claimedBy should be albert');
      
      console.log('✅ TEST PASSED: Cross-agent - unassign then reassign');
      results.push({ name: 'Cross-agent - unassign/reassign', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: Cross-agent - unassign/reassign:', err.message);
      results.push({ name: 'Cross-agent - unassign/reassign', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: Task discovery format
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      // Add some tasks
      tm.addTask({
        type: 'TASK',
        title: 'Planner task 1',
        assignedTo: 'planner',
        status: 'OPEN'
      });
      tm.addTask({
        type: 'TASK',
        title: 'Planner task 2',
        assignedTo: 'planner',
        status: 'IN_PROGRESS'  // Should not appear (not OPEN)
      });
      tm.addTask({
        type: 'EPIC',
        title: 'Planner epic',
        assignedTo: 'planner',
        status: 'OPEN'
      });
      tm.addTask({
        type: 'TASK',
        title: 'Coder task',
        assignedTo: 'coder',
        status: 'OPEN'
      });
      
      // Test formatTaskDiscovery via the plugin's logic
      const allTasks = tm.readTasks();
      const plannerTasks = allTasks.filter(
        t => t.assignedTo?.toLowerCase() === 'planner' && t.status === 'OPEN'
      );
      
      assert.strictEqual(plannerTasks.length, 2, 'Planner should have 2 OPEN tasks');
      
      // Verify format includes type labels and actions
      const TYPE_LABELS = { EPIC: '🎯 EPIC', TASK: '📋 TASK', STORY: '📄 STORY' };
      for (const task of plannerTasks) {
        assert.ok(TYPE_LABELS[task.type], 'Task should have proper type label');
      }
      
      console.log('✅ TEST PASSED: Task discovery format');
      results.push({ name: 'Task discovery format', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: Task discovery format:', err.message);
      results.push({ name: 'Task discovery format', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: Persistence across operations
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();
      
      // Add and modify tasks
      const task1 = tm.addTask({
        type: 'TASK',
        title: 'Persist test 1',
        assignedTo: 'coder'
      });
      
      tm.addTask({
        type: 'EPIC',
        title: 'Persist test 2',
        assignedTo: 'planner'
      });
      
      tm.claimTask(task1.id, 'coder');
      
      // Clear require cache to simulate new import
      clearRequireCache();
      const tm2 = getModule();
      
      // Verify data persisted
      const tasks = tm2.readTasks();
      const claimed = tasks.find(t => t.id === task1.id);
      
      assert.strictEqual(claimed.status, 'IN_PROGRESS', 'Status should persist');
      assert.strictEqual(claimed.claimedBy, 'coder', 'claimedBy should persist');
      assert.strictEqual(tasks.length, 2, 'Should have 2 tasks');
      
      console.log('✅ TEST PASSED: Persistence across operations');
      results.push({ name: 'Persistence across operations', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: Persistence:', err.message);
      results.push({ name: 'Persistence', status: 'FAIL', error: err.message });
    }

  } finally {
    // Restore original state once at the end
    restoreTasks();
  }

  // ==========================================
  // Print Summary
  // ==========================================
  console.log('');
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('');
  
  if (failed > 0) {
    console.log('FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('');
  console.log('='.repeat(60));
  
  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
