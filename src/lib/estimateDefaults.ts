/**
 * Default template rows for new estimates — parsed from Ron Brown's RB-Est Template.
 * Populated into indirect_labor, general_expenses, and rentals on estimate creation.
 * All quantities/hours are 0; the estimator fills them in per project.
 */

export interface DefaultIndirectLabor {
  description: string;
  labor_type: string;
  labor_rate: number;  // base * (1 + burden 0.37)
  people: number;
  hours_per_wk: number;
  weeks: number;
  total_cost: number;
  sort_order: number;
}

export interface DefaultGenExpense {
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  sort_order: number;
}

export interface DefaultRental {
  description: string;
  quantity: number;
  rate: number;
  duration: number;
  unit: string;
  taxable: boolean;
  total_cost: number;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Indirect Labor — from Indirect Labor tab, rows 6-35
// labor_rate = base_rate * 1.37 (burden factor from spreadsheet)
// ---------------------------------------------------------------------------
export const DEFAULT_INDIRECT_LABOR: DefaultIndirectLabor[] = [
  { description: "Superintendent",                         labor_type: "super",   labor_rate: 143.85, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 0 },
  { description: "General Superintendent",                  labor_type: "super",   labor_rate: 164.40, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 1 },
  { description: "G Foreman",                               labor_type: "foreman", labor_rate: 78.09,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 2 },
  { description: "Superintendent - Network",                labor_type: "super",   labor_rate: 47.95,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 3 },
  { description: "Superintendent - Network Out-of-Town",    labor_type: "super",   labor_rate: 95.90,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 4 },
  { description: "Project Manager - Network Out-of-Town",   labor_type: "pm",      labor_rate: 116.45, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 5 },
  { description: "Sr. Project Manager",                     labor_type: "pm",      labor_rate: 164.40, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 6 },
  { description: "Asst Project Management",                 labor_type: "pm",      labor_rate: 89.05,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 7 },
  { description: "Sr Project Manager (0.5 FTE)",            labor_type: "pm",      labor_rate: 89.05,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 8 },
  { description: "Project Manager",                         labor_type: "pm",      labor_rate: 130.15, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 9 },
  { description: "Project Executive - Out-of-Town",         labor_type: "pm",      labor_rate: 191.80, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 10 },
  { description: "Project Executive",                       labor_type: "pm",      labor_rate: 184.95, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 11 },
  { description: "PLC Programming (A&C)",                   labor_type: "other",   labor_rate: 61.65,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 12 },
  { description: "HMI Programming (A&C)",                   labor_type: "other",   labor_rate: 61.65,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 13 },
  { description: "Panel Checkout (A&C)",                    labor_type: "other",   labor_rate: 61.65,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 14 },
  { description: "Field Engineering - Out-of-Town",         labor_type: "other",   labor_rate: 75.35,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 15 },
  { description: "Pre-Con Services",                        labor_type: "pm",      labor_rate: 171.25, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 16 },
  { description: "Project Engineer",                        labor_type: "pm",      labor_rate: 89.05,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 17 },
  { description: "Estimating (0.25 FTE)",                   labor_type: "other",   labor_rate: 84.94,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 18 },
  { description: "Engineering & Design",                    labor_type: "other",   labor_rate: 102.75, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 19 },
  { description: "Asst Project Management - Out-of-Town",   labor_type: "pm",      labor_rate: 89.05,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 20 },
  { description: "CAD / BIM",                               labor_type: "other",   labor_rate: 102.75, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 21 },
  { description: "Quality Control QA/QC & Energy Marshal",  labor_type: "other",   labor_rate: 102.75, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 22 },
  { description: "On-Site Commissioning Lead (0.2 FTE)",    labor_type: "other",   labor_rate: 102.75, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 23 },
  { description: "Site Safety Representative",              labor_type: "other",   labor_rate: 102.75, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 24 },
  { description: "Administrative Assistant",                labor_type: "other",   labor_rate: 47.95,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 25 },
  { description: "Onboarding / Badging / Drug Testing",     labor_type: "other",   labor_rate: 47.95,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 26 },
  { description: "Material Handling",                       labor_type: "other",   labor_rate: 47.95,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 27 },
  { description: "Cleanup",                                 labor_type: "other",   labor_rate: 20.55,  people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 28 },
  { description: "Delegated Engineering",                   labor_type: "other",   labor_rate: 274.00, people: 1, hours_per_wk: 40, weeks: 0, total_cost: 0, sort_order: 29 },
];

// ---------------------------------------------------------------------------
// General Expenses — from Gen Exp tab, rows 3-63
// unit_cost is the pre-tax base rate from the spreadsheet
// ---------------------------------------------------------------------------
export const DEFAULT_GEN_EXPENSES: DefaultGenExpense[] = [
  { description: "Office Trailer Single",                unit: "month", unit_cost: 950,    quantity: 0, total_cost: 0, sort_order: 0 },
  { description: "Office Trailer Double Wide",           unit: "month", unit_cost: 1755,   quantity: 0, total_cost: 0, sort_order: 1 },
  { description: "Office Trailer Triple Wide",           unit: "month", unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 2 },
  { description: "Office Trailer Four Wide",             unit: "month", unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 3 },
  { description: "Office Trailer Set Up Charge Single",  unit: "lot",   unit_cost: 1500,   quantity: 0, total_cost: 0, sort_order: 4 },
  { description: "Office Trailer Set Up Charge Double",  unit: "lot",   unit_cost: 6500,   quantity: 0, total_cost: 0, sort_order: 5 },
  { description: "Office Trailer Skirting",              unit: "lot",   unit_cost: 2500,   quantity: 0, total_cost: 0, sort_order: 6 },
  { description: "Storage Conex / Office",               unit: "month", unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 7 },
  { description: "Storage Conex",                        unit: "month", unit_cost: 265,    quantity: 0, total_cost: 0, sort_order: 8 },
  { description: "Office Trailer Water & Sewer Hook-ups",unit: "month", unit_cost: 180,    quantity: 0, total_cost: 0, sort_order: 9 },
  { description: "Office Trailer Electrical Service",    unit: "month", unit_cost: 150,    quantity: 0, total_cost: 0, sort_order: 10 },
  { description: "Office Trailer Security System",       unit: "month", unit_cost: 50,     quantity: 0, total_cost: 0, sort_order: 11 },
  { description: "Office Furniture & Equipment",         unit: "month", unit_cost: 540,    quantity: 0, total_cost: 0, sort_order: 12 },
  { description: "Office Equipment - Copier/Printer",    unit: "month", unit_cost: 250,    quantity: 0, total_cost: 0, sort_order: 13 },
  { description: "Office Supplies",                      unit: "month", unit_cost: 350,    quantity: 0, total_cost: 0, sort_order: 14 },
  { description: "Postage / Fed-Ex / Courier",           unit: "month", unit_cost: 85,     quantity: 0, total_cost: 0, sort_order: 15 },
  { description: "Office Water / Coffee Service",        unit: "month", unit_cost: 280,    quantity: 0, total_cost: 0, sort_order: 16 },
  { description: "Copy Machine & Paper",                 unit: "month", unit_cost: 550,    quantity: 0, total_cost: 0, sort_order: 17 },
  { description: "Printing and Reprographics",           unit: "month", unit_cost: 300,    quantity: 0, total_cost: 0, sort_order: 18 },
  { description: "First Aid Supplies",                   unit: "month", unit_cost: 300,    quantity: 0, total_cost: 0, sort_order: 19 },
  { description: "Computers, Printers & Software",       unit: "month", unit_cost: 6000,   quantity: 0, total_cost: 0, sort_order: 20 },
  { description: "PM / Super Computer Kit",              unit: "month", unit_cost: 115,    quantity: 0, total_cost: 0, sort_order: 21 },
  { description: "CAD Computer Kit",                     unit: "month", unit_cost: 415,    quantity: 0, total_cost: 0, sort_order: 22 },
  { description: "iPad Kit",                             unit: "month", unit_cost: 90,     quantity: 0, total_cost: 0, sort_order: 23 },
  { description: "Digital Plan Table",                   unit: "month", unit_cost: 120,    quantity: 0, total_cost: 0, sort_order: 24 },
  { description: "Job Site Plotter",                     unit: "month", unit_cost: 400,    quantity: 0, total_cost: 0, sort_order: 25 },
  { description: "Job Site Server w/ Internet",          unit: "month", unit_cost: 360,    quantity: 0, total_cost: 0, sort_order: 26 },
  { description: "Cell Phones",                          unit: "month", unit_cost: 70,     quantity: 0, total_cost: 0, sort_order: 27 },
  { description: "Radios",                               unit: "month", unit_cost: 450,    quantity: 0, total_cost: 0, sort_order: 28 },
  { description: "TEXO Safety Class",                    unit: "month", unit_cost: 350,    quantity: 0, total_cost: 0, sort_order: 29 },
  { description: "Employee Drug Screening",              unit: "month", unit_cost: 50,     quantity: 0, total_cost: 0, sort_order: 30 },
  { description: "Safety Supplies",                      unit: "month", unit_cost: 300,    quantity: 0, total_cost: 0, sort_order: 31 },
  { description: "PPE",                                  unit: "month", unit_cost: 25,     quantity: 0, total_cost: 0, sort_order: 32 },
  { description: "Fire Extinguisher",                    unit: "month", unit_cost: 60,     quantity: 0, total_cost: 0, sort_order: 33 },
  { description: "Vehicle Rental / Job Trucks",          unit: "month", unit_cost: 540,    quantity: 0, total_cost: 0, sort_order: 34 },
  { description: "Vehicle Fuel, Maint. & Repair",        unit: "month", unit_cost: 250,    quantity: 0, total_cost: 0, sort_order: 35 },
  { description: "Vehicle Insurance",                    unit: "month", unit_cost: 120,    quantity: 0, total_cost: 0, sort_order: 36 },
  { description: "Travel, Mileage, Toll Fees",           unit: "month", unit_cost: 120,    quantity: 0, total_cost: 0, sort_order: 37 },
  { description: "Fuel (gallon)",                        unit: "gallon",unit_cost: 4,      quantity: 0, total_cost: 0, sort_order: 38 },
  { description: "Bus",                                  unit: "month", unit_cost: 125,    quantity: 0, total_cost: 0, sort_order: 39 },
  { description: "Parking",                              unit: "month", unit_cost: 37049,  quantity: 0, total_cost: 0, sort_order: 40 },
  { description: "Off-Site Storage",                     unit: "month", unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 41 },
  { description: "Logistics",                            unit: "month", unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 42 },
  { description: "Cleanup",                              unit: "month", unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 43 },
  { description: "Preconstruction",                      unit: "month", unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 44 },
  { description: "Permit Fee",                           unit: "lot",   unit_cost: 100,    quantity: 0, total_cost: 0, sort_order: 45 },
  { description: "Plan Charge",                          unit: "lot",   unit_cost: 255,    quantity: 0, total_cost: 0, sort_order: 46 },
  { description: "Misc Labor (3% of unburdened labor)",  unit: "lot",   unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 47 },
  { description: "Misc Material (2.6% of commodity mat)",unit: "lot",   unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 48 },
  { description: "Access Panels",                        unit: "lot",   unit_cost: 50,     quantity: 0, total_cost: 0, sort_order: 49 },
  { description: "Fire Stopping",                        unit: "sq ft", unit_cost: 0.025,  quantity: 0, total_cost: 0, sort_order: 50 },
  { description: "Labeling",                             unit: "sq ft", unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 51 },
  { description: "Misc Expense",                         unit: "lot",   unit_cost: 10000,  quantity: 0, total_cost: 0, sort_order: 52 },
  { description: "Misc Expense 2",                       unit: "lot",   unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 53 },
  { description: "Misc Expense 3",                       unit: "lot",   unit_cost: 0,      quantity: 0, total_cost: 0, sort_order: 54 },
];

// ---------------------------------------------------------------------------
// Rentals — from Rental tab, rows 5-55
// taxable = true for all (spreadsheet applies 8.25% tax to all)
// ---------------------------------------------------------------------------
export const DEFAULT_RENTALS: DefaultRental[] = [
  { description: "ONE VERT MAN LIFT (25')",          unit: "month",       rate: 506.25,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 0 },
  { description: "ONE VERT MAN LIFT (30')",          unit: "month",       rate: 675.00,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 1 },
  { description: "ONE VERT MAN LIFT (40')",          unit: "month",       rate: 425.25,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 2 },
  { description: "ELEC SCISSOR LIFT (19')",          unit: "month",       rate: 384.75,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 3 },
  { description: "ELEC SCISSOR LIFT (26')",          unit: "month",       rate: 681.75,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 4 },
  { description: "ELEC SCISSOR LIFT (32')",          unit: "month",       rate: 1032.75,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 5 },
  { description: "ELEC SCISSOR LIFT (39')",          unit: "month",       rate: 1613.25,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 6 },
  { description: "RTS 4WD LIFT (25')",               unit: "month",       rate: 938.25,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 7 },
  { description: "RTS 4WD LIFT (33')",               unit: "month",       rate: 1113.75,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 8 },
  { description: "RTS 4WD LIFT (40')",               unit: "month",       rate: 1343.25,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 9 },
  { description: "RTS 4WD LIFT (50')",               unit: "month",       rate: 2430.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 10 },
  { description: "SKYTRACK 6000",                    unit: "month",       rate: 2450.25,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 11 },
  { description: "SKYTRACK 8000",                    unit: "month",       rate: 2639.25,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 12 },
  { description: "SKYTRACK 10000",                   unit: "month",       rate: 3908.25,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 13 },
  { description: "EQUIPMENT RENTAL (general)",       unit: "month",       rate: 3375.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 14 },
  { description: "BACKHOE (cu yd)",                  unit: "cu yd",       rate: 10.80,    duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 15 },
  { description: "BACKHOE 580",                      unit: "month",       rate: 1957.50,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 16 },
  { description: "BACKHOE 4WD",                      unit: "month",       rate: 2430.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 17 },
  { description: "ROCK TRENCHER",                    unit: "month",       rate: 0,        duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 18 },
  { description: "TRENCHER (linear foot)",           unit: "linear foot", rate: 0.4725,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 19 },
  { description: "TRENCHER (32HP RIDE-ON)",          unit: "month",       rate: 1890.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 20 },
  { description: "TRENCHER (WALK BEHIND)",           unit: "month",       rate: 1822.50,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 21 },
  { description: "5 CU YD DUMP TRUCK",               unit: "month",       rate: 2025.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 22 },
  { description: "2,000 GAL WATER TRUCK",            unit: "month",       rate: 2497.50,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 23 },
  { description: "TAMPER",                           unit: "month",       rate: 492.75,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 24 },
  { description: "3,450# VIBRATORY PLATE",           unit: "month",       rate: 540.00,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 25 },
  { description: "66\" ROLLER",                      unit: "month",       rate: 2058.75,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 26 },
  { description: "7'-6\" MINI TRACKHOE",             unit: "month",       rate: 1491.75,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 27 },
  { description: "12'-0\" MINI TRACKHOE",            unit: "month",       rate: 2153.25,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 28 },
  { description: "POLE LINE TRUCK",                  unit: "month",       rate: 2018.25,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 29 },
  { description: "BOOM TRUCK",                       unit: "month",       rate: 600.00,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 30 },
  { description: "CRANE",                            unit: "month",       rate: 0,        duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 31 },
  { description: "COMPRESSOR",                       unit: "month",       rate: 614.25,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 32 },
  { description: "FORKLIFT",                         unit: "month",       rate: 1059.75,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 33 },
  { description: "Tool Rental",                      unit: "month",       rate: 31250.00, duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 34 },
  { description: "STRAIGHT BOOM LIFT 45'",           unit: "month",       rate: 2031.75,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 35 },
  { description: "STRAIGHT BOOM LIFT 65'",           unit: "month",       rate: 2902.50,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 36 },
  { description: "STRAIGHT BOOM LIFT 85'",           unit: "month",       rate: 5670.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 37 },
  { description: "STRAIGHT BOOM LIFT 120'",          unit: "month",       rate: 11475.00, duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 38 },
  { description: "STRAIGHT BOOM LIFT 135'",          unit: "month",       rate: 12825.00, duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 39 },
  { description: "ARTICULATING BOOM 30' ELEC",       unit: "month",       rate: 1829.25,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 40 },
  { description: "ARTICULATING BOOM 45' ELEC",       unit: "month",       rate: 1957.50,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 41 },
  { description: "ARTICULATING BOOM 34' 2WD",        unit: "month",       rate: 1620.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 42 },
  { description: "ARTICULATING BOOM 45' 2WD",        unit: "month",       rate: 2500.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 43 },
  { description: "WELDING MACHINE",                  unit: "month",       rate: 607.50,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 44 },
  { description: "GENERATOR 6-7KW",                  unit: "month",       rate: 472.50,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 45 },
  { description: "6,000W TOWABLE LIGHT TOWER",       unit: "month",       rate: 668.25,   duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 46 },
  { description: "FUEL (gallon)",                    unit: "gallon",      rate: 4.05,     duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 47 },
  { description: "PICKUPS (month)",                  unit: "month",       rate: 2000.00,  duration: 0, quantity: 0, taxable: true, total_cost: 0, sort_order: 48 },
];
