#!/usr/bin/env node
"use client";

import React from 'react';

// 1. Deliberate runtime conditional (SHOULD NOT BE MOVED)
if (typeof window !== 'undefined') {
    const analytics = require('./analytics');
}

export function DataViewer() {
    // 2. Misplaced nested ES import (SHOULD BE MOVED TO TOP)
    import { formatCurrency } from './utils/format';

    // 3. Misplaced require call (SHOULD BE MOVED TO TOP)
    const path = require('path');

    return null;
}
