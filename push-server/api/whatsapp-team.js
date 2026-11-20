// "You have a team now": after the organisers put the people who were alone in their team together
// (bd_merge_solos() in supabase.sql), the database sends each person their own WhatsApp message: the team name
// and their new teammates' names and WhatsApp numbers. Same WATI template, token and secret as whatsapp.js.
module.exports = require("./whatsapp").handler(true);
