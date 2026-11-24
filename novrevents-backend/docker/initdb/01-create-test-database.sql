-- Runs once, when the development PostgreSQL volume is first initialised.
-- Creates the isolated database used by the automated test suite.
CREATE DATABASE novrevents_test OWNER novr;
