/**
 * Phase 3.2 Test Suite for Task Manager Plugin
 * Tests: Task Dependencies, Auto-blocking, Auto-unblocking, Circular dependency prevention
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
// TEST SUITE: Phase 3.2 Dependencies
// ============================================

async function runTests() {
  const results = [];

  console.log('='.repeat(60));
  console.log('PHASE 3.2 TASK MANAGER TEST SUITE');
  console.log('='.repeat(60));
  console.log('');

  // Backup once at start
  backupTasks();

  try {
    // ==========================================
    // TEST: evaluateDependencies - no dependencies
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      const task = tm.addTask({
        type: 'TASK',
        title: 'Task without dependencies',
        assignedTo: 'coder'
      });

      const allTasks = tm.readTasks();
      const result = tm.evaluateDependencies(task, allTasks);

      assert.strictEqual(result.isBlocked, false, 'Task should not be blocked');
      assert.strictEqual(result.blockedBy.length, 0, 'blockedBy should be empty');

      console.log('✅ TEST PASSED: evaluateDependencies - no dependencies');
      results.push({ name: 'evaluateDependencies - no dependencies', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: evaluateDependencies - no dependencies:', err.message);
      results.push({ name: 'evaluateDependencies - no dependencies', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: evaluateDependencies - with incomplete dependencies
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      // Create dependency task (OPEN)
      const depTask = tm.addTask({
        type: 'TASK',
        title: 'Dependency task',
        assignedTo: 'coder',
        status: 'OPEN'
      });

      // Create task that depends on depTask
      const task = tm.addTask({
        type: 'TASK',
        title: 'Task with dependency',
        assignedTo: 'coder',
        dependsOn: [depTask.id]
      });

      const allTasks = tm.readTasks();
      const result = tm.evaluateDependencies(task, allTasks);

      assert.strictEqual(result.isBlocked, true, 'Task should be blocked');
      assert.strictEqual(result.blockedBy.length, 1, 'blockedBy should have 1 item');
      assert.strictEqual(result.blockedBy[0], depTask.id, 'blockedBy should contain depTask.id');

      console.log('✅ TEST PASSED: evaluateDependencies - with incomplete dependencies');
      results.push({ name: 'evaluateDependencies - with incomplete dependencies', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: evaluateDependencies - with incomplete dependencies:', err.message);
      results.push({ name: 'evaluateDependencies - with incomplete dependencies', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: evaluateDependencies - with completed dependencies
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      // Create and complete dependency task
      const depTask = tm.addTask({
        type: 'TASK',
        title: 'Dependency task',
        assignedTo: 'coder'
      });
      tm.completeTask(depTask.id, 'coder');

      // Create task that depends on completed depTask
      const task = tm.addTask({
        type: 'TASK',
        title: 'Task with completed dependency',
        assignedTo: 'coder',
        dependsOn: [depTask.id]
      });

      const allTasks = tm.readTasks();
      const result = tm.evaluateDependencies(task, allTasks);

      assert.strictEqual(result.isBlocked, false, 'Task should not be blocked');
      assert.strictEqual(result.blockedBy.length, 0, 'blockedBy should be empty');

      console.log('✅ TEST PASSED: evaluateDependencies - with completed dependencies');
      results.push({ name: 'evaluateDependencies - with completed dependencies', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: evaluateDependencies - with completed dependencies:', err.message);
      results.push({ name: 'evaluateDependencies - with completed dependencies', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: preventCircularDependencies - simple cycle
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      // Create task_001
      const task1 = tm.addTask({
        type: 'TASK',
        title: 'Task 1',
        assignedTo: 'coder'
      });

      // Try to create task_002 that depends on task_001, but task_001 would depend on task_002
      // This is a direct cycle
      try {
        const task2 = tm.addTask({
          type: 'TASK',
          title: 'Task 2',
          assignedTo: 'coder',
          dependsOn: [task1.id]
        });

        // Now try to make task_001 depend on task_002
        tm.updateTask(task1.id, { dependsOn: [task2.id] });
        assert.fail('Should have thrown for circular dependency');
      } catch (err) {
        assert.ok(err.message.includes('Circular dependency'), 'Error should mention circular dependency');
      }

      console.log('✅ TEST PASSED: preventCircularDependencies - simple cycle');
      results.push({ name: 'preventCircularDependencies - simple cycle', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: preventCircularDependencies - simple cycle:', err.message);
      results.push({ name: 'preventCircularDependencies - simple cycle', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: addTask - auto-blocking on creation
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      // Create dependency task (OPEN)
      const depTask = tm.addTask({
        type: 'TASK',
        title: 'Dependency task',
        assignedTo: 'coder'
      });

      // Create task that depends on depTask
      const task = tm.addTask({
        type: 'TASK',
        title: 'Task with dependency',
        assignedTo: 'coder',
        dependsOn: [depTask.id]
      });

      assert.strictEqual(task.status, 'BLOCKED', 'Task should be auto-blocked');
      assert.ok(Array.isArray(task.blockedBy), 'blockedBy should be an array');
      assert.strictEqual(task.blockedBy.length, 1, 'blockedBy should have 1 item');
      assert.strictEqual(task.blockedBy[0], depTask.id, 'blockedBy should contain depTask.id');

      console.log('✅ TEST PASSED: addTask - auto-blocking on creation');
      results.push({ name: 'addTask - auto-blocking on creation', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: addTask - auto-blocking on creation:', err.message);
      results.push({ name: 'addTask - auto-blocking on creation', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: updateTask - auto-blocking on edit
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      // Create dependency task (OPEN)
      const depTask = tm.addTask({
        type: 'TASK',
        title: 'Dependency task',
        assignedTo: 'coder'
      });

      // Create task without dependencies
      const task = tm.addTask({
        type: 'TASK',
        title: 'Task without dependencies',
        assignedTo: 'coder'
      });

      // Add dependency
      const updated = tm.updateTask(task.id, { dependsOn: [depTask.id] });

      assert.strictEqual(updated.status, 'BLOCKED', 'Task should be auto-blocked after edit');
      assert.strictEqual(updated.blockedBy.length, 1, 'blockedBy should have 1 item');
      assert.strictEqual(updated.blockedBy[0], depTask.id, 'blockedBy should contain depTask.id');

      console.log('✅ TEST PASSED: updateTask - auto-blocking on edit');
      results.push({ name: 'updateTask - auto-blocking on edit', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: updateTask - auto-blocking on edit:', err.message);
      results.push({ name: 'updateTask - auto-blocking on edit', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: completeTask - auto-unblocking dependents
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      // Create task_001 (OPEN)
      const task1 = tm.addTask({
        type: 'TASK',
        title: 'Task 1',
        assignedTo: 'coder'
      });

      // Create task_002 that depends on task_001
      const task2 = tm.addTask({
        type: 'TASK',
        title: 'Task 2 depends on 1',
        assignedTo: 'coder',
        dependsOn: [task1.id]
      });

      // task_002 should be BLOCKED
      assert.strictEqual(task2.status, 'BLOCKED', 'task_002 should be BLOCKED initially');

      // Complete task_001
      tm.completeTask(task1.id, 'coder');

      // Reload task_002 and check it's unblocked
      const allTasks = tm.readTasks();
      const task2Updated = allTasks.find(t => t.id === task2.id);

      assert.strictEqual(task2Updated.status, 'OPEN', 'task_002 should be auto-unblocked to OPEN');
      assert.strictEqual(task2Updated.blockedBy.length, 0, 'blockedBy should be empty after unblocking');

      console.log('✅ TEST PASSED: completeTask - auto-unblocking dependents');
      results.push({ name: 'completeTask - auto-unblocking dependents', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: completeTask - auto-unblocking dependents:', err.message);
      results.push({ name: 'completeTask - auto-unblocking dependents', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: completeTask - auto-unblocking with multiple dependencies
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      // Create two dependency tasks
      const dep1 = tm.addTask({
        type: 'TASK',
        title: 'Dependency 1',
        assignedTo: 'coder'
      });

      const dep2 = tm.addTask({
        type: 'TASK',
        title: 'Dependency 2',
        assignedTo: 'coder'
      });

      // Create task that depends on both
      const task = tm.addTask({
        type: 'TASK',
        title: 'Task with 2 dependencies',
        assignedTo: 'coder',
        dependsOn: [dep1.id, dep2.id]
      });

      // task should be BLOCKED
      assert.strictEqual(task.status, 'BLOCKED', 'Task should be BLOCKED initially');

      // Complete only dep1
      tm.completeTask(dep1.id, 'coder');

      // Reload task - should still be BLOCKED
      let allTasks = tm.readTasks();
      let taskUpdated = allTasks.find(t => t.id === task.id);
      assert.strictEqual(taskUpdated.status, 'BLOCKED', 'Task should still be BLOCKED after 1 dep completes');

      // Complete dep2
      tm.completeTask(dep2.id, 'coder');

      // Reload task - should be unblocked now
      allTasks = tm.readTasks();
      taskUpdated = allTasks.find(t => t.id === task.id);
      assert.strictEqual(taskUpdated.status, 'OPEN', 'Task should be OPEN after all deps complete');
      assert.strictEqual(taskUpdated.blockedBy.length, 0, 'blockedBy should be empty');

      console.log('✅ TEST PASSED: completeTask - auto-unblocking with multiple dependencies');
      results.push({ name: 'completeTask - auto-unblocking with multiple dependencies', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: completeTask - auto-unblocking with multiple dependencies:', err.message);
      results.push({ name: 'completeTask - auto-unblocking with multiple dependencies', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: validateDependencyIds - invalid ID
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      try {
        tm.addTask({
          type: 'TASK',
          title: 'Task with invalid dependency',
          assignedTo: 'coder',
          dependsOn: ['task_999']  // Non-existent task
        });
        assert.fail('Should have thrown for invalid dependency ID');
      } catch (err) {
        assert.ok(err.message.includes('Dependency not found'), 'Error should mention dependency not found');
      }

      console.log('✅ TEST PASSED: validateDependencyIds - invalid ID');
      results.push({ name: 'validateDependencyIds - invalid ID', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: validateDependencyIds - invalid ID:', err.message);
      results.push({ name: 'validateDependencyIds - invalid ID', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: getDependentTasks - find dependents
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      const task1 = tm.addTask({
        type: 'TASK',
        title: 'Task 1',
        assignedTo: 'coder'
      });

      const task2 = tm.addTask({
        type: 'TASK',
        title: 'Task 2 depends on 1',
        assignedTo: 'coder',
        dependsOn: [task1.id]
      });

      const task3 = tm.addTask({
        type: 'TASK',
        title: 'Task 3 also depends on 1',
        assignedTo: 'coder',
        dependsOn: [task1.id]
      });

      const allTasks = tm.readTasks();
      const dependents = tm.getDependentTasks(task1.id, allTasks);

      assert.strictEqual(dependents.length, 2, 'Should find 2 dependent tasks');
      assert.ok(dependents.includes(task2.id), 'Should include task2');
      assert.ok(dependents.includes(task3.id), 'Should include task3');

      console.log('✅ TEST PASSED: getDependentTasks - find dependents');
      results.push({ name: 'getDependentTasks - find dependents', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: getDependentTasks - find dependents:', err.message);
      results.push({ name: 'getDependentTasks - find dependents', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: Blocked task has blockedBy and blockedReason populated
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      const depTask = tm.addTask({
        type: 'TASK',
        title: 'Dependency task',
        assignedTo: 'coder'
      });

      const task = tm.addTask({
        type: 'TASK',
        title: 'Task with dependency',
        assignedTo: 'coder',
        dependsOn: [depTask.id]
      });

      assert.strictEqual(task.status, 'BLOCKED', 'Task should be BLOCKED');
      assert.ok(Array.isArray(task.blockedBy), 'blockedBy should be an array');
      assert.strictEqual(task.blockedBy.length, 1, 'blockedBy should have 1 item');
      assert.ok(task.blockedReason, 'blockedReason should be set');
      assert.ok(task.blockedReason.includes(depTask.id), 'blockedReason should mention the blocking task');

      console.log('✅ TEST PASSED: Blocked task has blockedBy and blockedReason populated');
      results.push({ name: 'Blocked task has blockedBy and blockedReason populated', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: Blocked task has blockedBy and blockedReason populated:', err.message);
      results.push({ name: 'Blocked task has blockedBy and blockedReason populated', status: 'FAIL', error: err.message });
    }

    // ==========================================
    // TEST: updateTask - removing dependency unblocks task
    // ==========================================
    try {
      resetTasksStore();
      const tm = getModule();

      const depTask = tm.addTask({
        type: 'TASK',
        title: 'Dependency task',
        assignedTo: 'coder'
      });

      const task = tm.addTask({
        type: 'TASK',
        title: 'Task with dependency',
        assignedTo: 'coder',
        dependsOn: [depTask.id]
      });

      assert.strictEqual(task.status, 'BLOCKED', 'Task should be BLOCKED');

      // Remove dependency
      const updated = tm.updateTask(task.id, { dependsOn: [] });

      assert.strictEqual(updated.status, 'OPEN', 'Task should be OPEN after removing dependencies');
      assert.strictEqual(updated.blockedBy.length, 0, 'blockedBy should be empty');
      assert.strictEqual(updated.blockedReason, '', 'blockedReason should be empty');

      console.log('✅ TEST PASSED: updateTask - removing dependency unblocks task');
      results.push({ name: 'updateTask - removing dependency unblocks task', status: 'PASS' });
    } catch (err) {
      console.log('❌ TEST FAILED: updateTask - removing dependency unblocks task:', err.message);
      results.push({ name: 'updateTask - removing dependency unblocks task', status: 'FAIL', error: err.message });
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
