'use strict';

const { Router } = require('express');
const match = require('../controllers/match.controller');

const router = Router();

router.post('/score', match.scoreOne);
router.post('/batch', match.scoreBatch);

module.exports = router;
