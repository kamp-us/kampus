import m0000 from "./0000_clear_barracuda.sql";
import m0001 from "./0001_skinny_mariko_yashida.sql";
import journal from "./meta/_journal.json";

export default {
	journal,
	migrations: {
		m0000,
		m0001,
	},
};
