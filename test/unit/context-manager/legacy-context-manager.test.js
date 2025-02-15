/*
 * Copyright 2021 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const { test } = require('tap')

const runLegacyTests = require('./legacy-context-tests')
const LegacyContextManager = require('../../../lib/context-manager/legacy-context-manager')

test('Legacy Context Manager', (t) => {
  t.autoend()

  runLegacyTests(t, createLegacyContextManager)
})

function createLegacyContextManager() {
  return new LegacyContextManager({})
}
