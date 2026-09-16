/* Query Mirror — engine.js
   Pure, DOM-free: the four synthetic datasets, the click-state → SQL generator, the SQL
   formatter, the practice-mode grader and the URL codec. Loaded as a classic <script> in the
   browser (window.QueryMirror) and with require() in node (check.mjs). No dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QueryMirror = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';
const VERSION = '2.0.0';

const DDL={
ecommerce:`CREATE TABLE product(prod_id TEXT, prod_name TEXT, category TEXT, stock_qty INTEGER, unit_price REAL);
INSERT INTO product VALUES('P001','Wireless Headphones','Electronics',85,79.99);
INSERT INTO product VALUES('P002','Yoga Mat','Sports',120,29.99);
INSERT INTO product VALUES('P003','Coffee Maker','Kitchen',45,49.99);
INSERT INTO product VALUES('P004','Running Shoes','Sports',60,89.99);
INSERT INTO product VALUES('P005','Desk Lamp','Office',200,24.99);
INSERT INTO product VALUES('P006','Blender Pro','Kitchen',30,64.99);
INSERT INTO product VALUES('P007','Laptop Stand','Office',150,39.99);
INSERT INTO product VALUES('P008','Resistance Bands','Sports',300,14.99);
INSERT INTO product VALUES('P009','Smart Watch','Electronics',40,199.99);
INSERT INTO product VALUES('P010','Air Purifier','Home',25,129.99);
INSERT INTO product VALUES('P011','Cookbook','Books',180,19.99);

CREATE TABLE customer(cust_id INTEGER, last_name TEXT, first_name TEXT, email TEXT, city TEXT, country TEXT, referred_by INTEGER);
INSERT INTO customer VALUES(1,'Chen','Lily','lily.c@example.com','Toronto','Canada',NULL);
INSERT INTO customer VALUES(2,'Smith','James','j.smith@example.com','New York','US',1);
INSERT INTO customer VALUES(3,'Patel','Priya','p.patel@example.com','London','UK',1);
INSERT INTO customer VALUES(4,'Garcia','Carlos','c.garcia@example.com','Madrid','Spain',NULL);
INSERT INTO customer VALUES(5,'Kim','Soo','soo.kim@example.com','Seoul','Korea',4);
INSERT INTO customer VALUES(6,'Müller','Hans','h.muller@example.com','Berlin','Germany',4);
INSERT INTO customer VALUES(7,'Dubois','Claire','c.dubois@example.com','Paris','France',NULL);
INSERT INTO customer VALUES(8,'Tanaka','Yuki','y.tanaka@example.com','Tokyo','Japan',7);
INSERT INTO customer VALUES(9,'Okonkwo','Emeka','e.okonkwo@example.com','Lagos','Nigeria',7);
INSERT INTO customer VALUES(10,'Rossi','Marco','m.rossi@example.com','Rome','Italy',NULL);

CREATE TABLE order_hdr(order_id INTEGER, order_date TEXT, cust_id INTEGER, status TEXT);
INSERT INTO order_hdr VALUES(1001,'2024-01-15',1,'Delivered');
INSERT INTO order_hdr VALUES(1002,'2024-02-03',3,'Delivered');
INSERT INTO order_hdr VALUES(1003,'2024-02-18',1,'Shipped');
INSERT INTO order_hdr VALUES(1004,'2024-03-05',5,'Delivered');
INSERT INTO order_hdr VALUES(1005,'2024-03-22',7,'Processing');
INSERT INTO order_hdr VALUES(1006,'2024-04-01',2,'Delivered');
INSERT INTO order_hdr VALUES(1007,'2024-04-14',10,'Shipped');

CREATE TABLE order_item(order_id INTEGER, prod_id TEXT, quantity INTEGER, price_charged REAL);
INSERT INTO order_item VALUES(1001,'P001',1,79.99);
INSERT INTO order_item VALUES(1001,'P005',2,24.99);
INSERT INTO order_item VALUES(1002,'P009',1,199.99);
INSERT INTO order_item VALUES(1002,'P007',1,39.99);
INSERT INTO order_item VALUES(1003,'P002',1,29.99);
INSERT INTO order_item VALUES(1003,'P008',2,14.99);
INSERT INTO order_item VALUES(1004,'P004',1,89.99);
INSERT INTO order_item VALUES(1005,'P006',1,64.99);
INSERT INTO order_item VALUES(1005,'P011',2,19.99);
INSERT INTO order_item VALUES(1006,'P010',1,129.99);
INSERT INTO order_item VALUES(1007,'P003',1,49.99);`,
hospital:`CREATE TABLE patient(patient_id INTEGER, last_name TEXT, first_name TEXT, dob TEXT, gender TEXT, city TEXT, country TEXT);
INSERT INTO patient VALUES(101,'Anderson','Emily','1990-03-12','F','Chicago','US');
INSERT INTO patient VALUES(102,'Brown','Liam','1985-07-24','M','Houston','US');
INSERT INTO patient VALUES(103,'Clark','Sophia','1978-11-05','F','Phoenix','US');
INSERT INTO patient VALUES(104,'Davis','Noah','1995-01-30','M','Toronto','Canada');
INSERT INTO patient VALUES(105,'Evans','Olivia','2000-06-18','F','London','UK');
INSERT INTO patient VALUES(106,'Fisher','William','1968-09-09','M','Sydney','Australia');
INSERT INTO patient VALUES(107,'Green','Ava','1992-04-22','F','Berlin','Germany');
INSERT INTO patient VALUES(108,'Harris','Mason','1975-12-01','M','Paris','France');
INSERT INTO patient VALUES(109,'Irving','Isabella','2003-08-15','F','Toronto','Canada');
INSERT INTO patient VALUES(110,'Jones','Ethan','1988-02-27','M','New York','US');
INSERT INTO patient VALUES(111,'King','Mia','1972-10-14','F','Chicago','US');
INSERT INTO patient VALUES(112,'Lewis','Logan','1999-05-03','M','Houston','US');
INSERT INTO patient VALUES(113,'Moore','Charlotte','1983-07-19','F','London','UK');
INSERT INTO patient VALUES(114,'Nelson','Oliver','2001-03-28','M','Sydney','Australia');
INSERT INTO patient VALUES(115,'Owen','Amelia','1965-11-11','F','Paris','France');
INSERT INTO patient VALUES(116,'Parker','Jacob','1991-06-06','M','Berlin','Germany');
INSERT INTO patient VALUES(117,'Quinn','Harper','1979-01-25','F','Phoenix','US');
INSERT INTO patient VALUES(118,'Reed','Lucas','2005-09-30','M','New York','US');
INSERT INTO patient VALUES(119,'Scott','Ella','1996-04-08','F','Toronto','Canada');
INSERT INTO patient VALUES(120,'Taylor','Henry','1962-08-17','M','Chicago','US');

CREATE TABLE doctor(doctor_id INTEGER, last_name TEXT, first_name TEXT, specialty TEXT, target_patients INTEGER);
INSERT INTO doctor VALUES(201,'Adams','Sarah','Cardiology',40);
INSERT INTO doctor VALUES(202,'Baker','Michael','Neurology',35);
INSERT INTO doctor VALUES(203,'Carter','Anna','Pediatrics',50);
INSERT INTO doctor VALUES(204,'Dixon','Robert','Orthopedics',30);
INSERT INTO doctor VALUES(205,'Ellis','Karen','General Practice',60);

CREATE TABLE appointment(appt_id INTEGER, patient_id INTEGER, doctor_id INTEGER, appt_date TEXT, diagnosis TEXT, fee REAL);
INSERT INTO appointment VALUES(3001,101,201,'2024-01-10','Hypertension',150.00);
INSERT INTO appointment VALUES(3002,102,202,'2024-01-15','Migraine',200.00);
INSERT INTO appointment VALUES(3003,103,201,'2024-01-22','Arrhythmia',175.00);
INSERT INTO appointment VALUES(3004,104,203,'2024-02-05','Flu',80.00);
INSERT INTO appointment VALUES(3005,105,205,'2024-02-12','Checkup',60.00);
INSERT INTO appointment VALUES(3006,106,204,'2024-02-20','Knee Pain',220.00);
INSERT INTO appointment VALUES(3007,107,202,'2024-03-01','Anxiety',180.00);
INSERT INTO appointment VALUES(3008,108,201,'2024-03-08','Chest Pain',175.00);
INSERT INTO appointment VALUES(3009,109,203,'2024-03-15','Ear Infection',75.00);
INSERT INTO appointment VALUES(3010,110,205,'2024-03-22','Back Pain',65.00);
INSERT INTO appointment VALUES(3011,111,204,'2024-04-02','Hip Pain',210.00);
INSERT INTO appointment VALUES(3012,112,203,'2024-04-10','Allergies',80.00);
INSERT INTO appointment VALUES(3013,113,201,'2024-04-18','High Cholesterol',150.00);
INSERT INTO appointment VALUES(3014,114,205,'2024-04-25','Checkup',60.00);
INSERT INTO appointment VALUES(3015,101,202,'2024-05-03','Headache',190.00);
INSERT INTO appointment VALUES(3016,115,204,'2024-05-10','Shoulder Pain',215.00);
INSERT INTO appointment VALUES(3017,116,203,'2024-05-17','Stomach Ache',75.00);
INSERT INTO appointment VALUES(3018,117,201,'2024-05-24','Palpitations',160.00);
INSERT INTO appointment VALUES(3019,118,205,'2024-06-01','Sprain',70.00);
INSERT INTO appointment VALUES(3020,119,202,'2024-06-08','Insomnia',185.00);
INSERT INTO appointment VALUES(3021,120,204,'2024-06-15','Fracture',240.00);
INSERT INTO appointment VALUES(3022,102,201,'2024-06-22','Follow-up',100.00);
INSERT INTO appointment VALUES(3023,103,205,'2024-07-01','Checkup',60.00);
INSERT INTO appointment VALUES(3024,104,204,'2024-07-08','Growth Check',90.00);
INSERT INTO appointment VALUES(3025,105,202,'2024-07-15','Stress',175.00);
INSERT INTO appointment VALUES(3026,106,201,'2024-07-22','Heart Scan',200.00);
INSERT INTO appointment VALUES(3027,107,203,'2024-07-29','Vaccination',55.00);
INSERT INTO appointment VALUES(3028,108,205,'2024-08-05','Diabetes Check',70.00);
INSERT INTO appointment VALUES(3029,109,204,'2024-08-12','Wrist Pain',205.00);
INSERT INTO appointment VALUES(3030,110,202,'2024-08-19','Memory Test',195.00);
INSERT INTO appointment VALUES(3031,111,203,'2024-08-26','Checkup',60.00);
INSERT INTO appointment VALUES(3032,112,201,'2024-09-02','Palpitations',155.00);
INSERT INTO appointment VALUES(3033,113,205,'2024-09-09','Flu',65.00);
INSERT INTO appointment VALUES(3034,114,202,'2024-09-16','Headache',185.00);
INSERT INTO appointment VALUES(3035,115,203,'2024-09-23','Allergy Test',90.00);
INSERT INTO appointment VALUES(3036,116,201,'2024-09-30','Blood Pressure',145.00);
INSERT INTO appointment VALUES(3037,117,204,'2024-10-07','Knee Scan',225.00);
INSERT INTO appointment VALUES(3038,118,205,'2024-10-14','Checkup',60.00);`,
movies:`CREATE TABLE film(film_id TEXT, title TEXT, release_year INTEGER, rating REAL, genre TEXT, box_office_m REAL, runtime_min INTEGER);
INSERT INTO film VALUES('F001','Echoes of Tomorrow',2021,8.2,'Sci-Fi',320.5,142);
INSERT INTO film VALUES('F002','The Last Harbor',2019,7.5,'Drama',85.3,118);
INSERT INTO film VALUES('F003','Neon Requiem',2022,8.7,'Thriller',412.0,131);
INSERT INTO film VALUES('F004','Sunken Roots',2020,6.9,'Drama',42.1,105);
INSERT INTO film VALUES('F005','Fractured Sky',2023,7.8,'Action',550.2,138);
INSERT INTO film VALUES('F006','A Quiet Fable',2018,8.4,'Drama',95.6,112);
INSERT INTO film VALUES('F007','Iron Meridian',2022,7.1,'Action',280.9,145);
INSERT INTO film VALUES('F008','The Pale Garden',2021,9.0,'Horror',180.4,127);
INSERT INTO film VALUES('F009','Drift',2023,6.5,'Comedy',60.2,98);
INSERT INTO film VALUES('F010','Celestial Noise',2020,8.1,'Sci-Fi',390.7,155);
INSERT INTO film VALUES('F011','Paper Boats',2019,7.6,'Romance',70.3,102);
INSERT INTO film VALUES('F012','Rogue Protocol',2022,7.3,'Action',310.8,140);
INSERT INTO film VALUES('F013','The Hollow Season',2021,8.6,'Mystery',160.5,125);
INSERT INTO film VALUES('F014','Wildfire',2023,7.0,'Drama',55.9,110);
INSERT INTO film VALUES('F015','Orbit',2020,8.9,'Sci-Fi',480.2,162);
INSERT INTO film VALUES('F016','Shallow Graves',2022,6.8,'Horror',95.1,115);
INSERT INTO film VALUES('F017','The Golden Hour',2019,7.4,'Romance',80.7,108);
INSERT INTO film VALUES('F018','Binary Storm',2023,7.9,'Thriller',260.3,133);
INSERT INTO film VALUES('F019','Salt and Stone',2021,8.3,'Drama',110.6,120);
INSERT INTO film VALUES('F020','Vertigo Blue',2022,7.7,'Mystery',140.4,128);
INSERT INTO film VALUES('F021','The Naming',2020,8.5,'Horror',200.1,135);
INSERT INTO film VALUES('F022','Chasing Static',2023,6.7,'Comedy',45.8,96);
INSERT INTO film VALUES('F023','Amber Signal',2021,7.2,'Thriller',175.3,122);
INSERT INTO film VALUES('F024','Deep Current',2022,8.0,'Sci-Fi',350.9,148);
INSERT INTO film VALUES('F025','Lantern Walk',2019,7.8,'Romance',65.4,104);

CREATE TABLE director(director_id INTEGER, full_name TEXT, nationality TEXT, birth_year INTEGER, awards_won INTEGER);
INSERT INTO director VALUES(301,'Aisha Nwosu','Nigerian',1978,6);
INSERT INTO director VALUES(302,'Carlos Vega','Mexican',1972,4);
INSERT INTO director VALUES(303,'Elena Sorokina','Russian',1980,8);
INSERT INTO director VALUES(304,'James Whitfield','British',1965,10);
INSERT INTO director VALUES(305,'Mei Lin','Chinese',1983,5);
INSERT INTO director VALUES(306,'Rafik Amara','Algerian',1975,3);
INSERT INTO director VALUES(307,'Sara Holmberg','Swedish',1988,2);
INSERT INTO director VALUES(308,'Tariq Hassan','Pakistani',1970,7);
INSERT INTO director VALUES(309,'Yuki Mori','Japanese',1985,4);
INSERT INTO director VALUES(310,'Lucia Ferraro','Italian',1977,9);
INSERT INTO director VALUES(311,'Ben Okafor','Ghanaian',1990,1);
INSERT INTO director VALUES(312,'Diana Marsh','American',1968,11);
INSERT INTO director VALUES(313,'Felix Braun','German',1982,3);
INSERT INTO director VALUES(314,'Grace Park','Korean',1979,6);
INSERT INTO director VALUES(315,'Hiro Yamada','Japanese',1974,8);
INSERT INTO director VALUES(316,'Ivan Petrov','Bulgarian',1986,2);
INSERT INTO director VALUES(317,'Julia Santos','Brazilian',1981,5);
INSERT INTO director VALUES(318,'Karan Mehta','Indian',1976,7);
INSERT INTO director VALUES(319,'Lena Kvist','Norwegian',1984,3);
INSERT INTO director VALUES(320,'Marcos Lima','Portuguese',1969,9);
INSERT INTO director VALUES(321,'Naomi Clarke','Australian',1987,4);
INSERT INTO director VALUES(322,'Omar Khalil','Egyptian',1973,6);
INSERT INTO director VALUES(323,'Paula Rivera','Argentinian',1982,2);
INSERT INTO director VALUES(324,'Quentin Moore','American',1966,12);
INSERT INTO director VALUES(325,'Rina Suzuki','Japanese',1991,1);

CREATE TABLE cast_link(film_id TEXT, director_id INTEGER, contribution TEXT);
INSERT INTO cast_link VALUES('F001',301,'Director');INSERT INTO cast_link VALUES('F001',305,'Producer');
INSERT INTO cast_link VALUES('F002',304,'Director');INSERT INTO cast_link VALUES('F003',303,'Director');
INSERT INTO cast_link VALUES('F003',312,'Executive Producer');INSERT INTO cast_link VALUES('F004',302,'Director');
INSERT INTO cast_link VALUES('F005',308,'Director');INSERT INTO cast_link VALUES('F005',314,'Co-Director');
INSERT INTO cast_link VALUES('F006',304,'Director');INSERT INTO cast_link VALUES('F007',306,'Director');
INSERT INTO cast_link VALUES('F008',310,'Director');INSERT INTO cast_link VALUES('F009',307,'Director');
INSERT INTO cast_link VALUES('F010',315,'Director');INSERT INTO cast_link VALUES('F011',317,'Director');
INSERT INTO cast_link VALUES('F012',318,'Director');INSERT INTO cast_link VALUES('F013',322,'Director');
INSERT INTO cast_link VALUES('F014',309,'Director');INSERT INTO cast_link VALUES('F015',312,'Director');
INSERT INTO cast_link VALUES('F015',324,'Producer');INSERT INTO cast_link VALUES('F016',311,'Director');
INSERT INTO cast_link VALUES('F017',319,'Director');INSERT INTO cast_link VALUES('F018',303,'Director');
INSERT INTO cast_link VALUES('F019',320,'Director');INSERT INTO cast_link VALUES('F020',323,'Director');
INSERT INTO cast_link VALUES('F021',310,'Director');INSERT INTO cast_link VALUES('F022',321,'Director');
INSERT INTO cast_link VALUES('F023',316,'Director');INSERT INTO cast_link VALUES('F024',313,'Director');
INSERT INTO cast_link VALUES('F025',325,'Director');

CREATE TABLE genre_tag(tag_id TEXT, tag_name TEXT);
INSERT INTO genre_tag VALUES('T1','suspenseful');INSERT INTO genre_tag VALUES('T2','emotional');
INSERT INTO genre_tag VALUES('T3','visually stunning');INSERT INTO genre_tag VALUES('T4','thought-provoking');
INSERT INTO genre_tag VALUES('T5','family-friendly');INSERT INTO genre_tag VALUES('T6','dark');
INSERT INTO genre_tag VALUES('T7','inspiring');INSERT INTO genre_tag VALUES('T8','fast-paced');
INSERT INTO genre_tag VALUES('T9','slow-burn');INSERT INTO genre_tag VALUES('T10','critically acclaimed');
INSERT INTO genre_tag VALUES('T11','cult classic');INSERT INTO genre_tag VALUES('T12','award-winning');
INSERT INTO genre_tag VALUES('T13','light-hearted');INSERT INTO genre_tag VALUES('T14','atmospheric');
INSERT INTO genre_tag VALUES('T15','edge-of-seat');INSERT INTO genre_tag VALUES('T16','tearjerker');
INSERT INTO genre_tag VALUES('T17','mind-bending');INSERT INTO genre_tag VALUES('T18','action-packed');

CREATE TABLE viewer(viewer_id INTEGER, username TEXT, full_name TEXT, country TEXT, membership TEXT, joined_year INTEGER, referred_by INTEGER);
INSERT INTO viewer VALUES(401,'cine_max','Alex Jordan','US','Premium',2021,NULL);
INSERT INTO viewer VALUES(402,'film_buff','Sam Lee','Canada','Standard',2022,401);
INSERT INTO viewer VALUES(403,'reeltime','Maya Patel','UK','Premium',2020,NULL);
INSERT INTO viewer VALUES(404,'watcherx','Liu Wei','China','Standard',2023,401);
INSERT INTO viewer VALUES(405,'movieworm','Ana Flores','Brazil','Premium',2021,403);
INSERT INTO viewer VALUES(406,'screentime','Erik Strand','Norway','Standard',2022,403);
INSERT INTO viewer VALUES(407,'bigscreen','Fatima Al-Said','UAE','Premium',2020,NULL);
INSERT INTO viewer VALUES(408,'cinephile','Tom Baker','Australia','Standard',2023,407);
INSERT INTO viewer VALUES(409,'reel_fan','Priya Sharma','India','Standard',2022,407);
INSERT INTO viewer VALUES(410,'popcorn_q','Jin Park','Korea','Premium',2021,NULL);
INSERT INTO viewer VALUES(411,'nite_owl','Chloe Martin','France','Standard',2023,410);
INSERT INTO viewer VALUES(412,'indie_eye','Riku Sato','Japan','Premium',2020,410);
INSERT INTO viewer VALUES(413,'lens_life','Sofia Rossi','Italy','Standard',2022,410);
INSERT INTO viewer VALUES(414,'frameshot','David Osei','Ghana','Standard',2023,410);
INSERT INTO viewer VALUES(415,'deep_cut','Ingrid Holm','Sweden','Premium',2021,NULL);
INSERT INTO viewer VALUES(416,'arthouse','Mehmet Yilmaz','Turkey','Standard',2022,415);
INSERT INTO viewer VALUES(417,'silver_scr','Nadia Ivanova','Russia','Premium',2020,NULL);
INSERT INTO viewer VALUES(418,'roll_film','Carlos Diaz','Mexico','Standard',2023,417);
INSERT INTO viewer VALUES(419,'cult_pick','Yara Haddad','Lebanon','Standard',2022,417);
INSERT INTO viewer VALUES(420,'box_office','Ethan Walsh','Ireland','Premium',2021,NULL);
INSERT INTO viewer VALUES(421,'matinee','Lily Huang','Taiwan','Standard',2023,420);
INSERT INTO viewer VALUES(422,'premiere','Oliver Grant','UK','Premium',2020,420);
INSERT INTO viewer VALUES(423,'director_cut','Zara Mensah','South Africa','Standard',2022,420);
INSERT INTO viewer VALUES(424,'final_cut','Pedro Alves','Portugal','Standard',2023,420);
INSERT INTO viewer VALUES(425,'scene_one','Aiko Nakamura','Japan','Premium',2021,NULL);

CREATE TABLE watch_history(watch_id TEXT, viewer_id INTEGER, tag_id TEXT, film_id TEXT);
INSERT INTO watch_history VALUES('W001',401,'T1','F003');INSERT INTO watch_history VALUES('W002',402,'T2','F006');
INSERT INTO watch_history VALUES('W003',403,'T3','F015');INSERT INTO watch_history VALUES('W004',404,'T4','F001');
INSERT INTO watch_history VALUES('W005',405,'T8','F005');INSERT INTO watch_history VALUES('W006',406,'T14','F013');
INSERT INTO watch_history VALUES('W007',407,'T6','F008');INSERT INTO watch_history VALUES('W008',408,'T10','F006');
INSERT INTO watch_history VALUES('W009',409,'T1','F018');INSERT INTO watch_history VALUES('W010',410,'T12','F015');
INSERT INTO watch_history VALUES('W011',411,'T9','F019');INSERT INTO watch_history VALUES('W012',412,'T17','F010');
INSERT INTO watch_history VALUES('W013',413,'T2','F025');INSERT INTO watch_history VALUES('W014',414,'T7','F022');
INSERT INTO watch_history VALUES('W015',415,'T11','F009');INSERT INTO watch_history VALUES('W016',416,'T6','F021');
INSERT INTO watch_history VALUES('W017',417,'T3','F024');INSERT INTO watch_history VALUES('W018',418,'T8','F007');
INSERT INTO watch_history VALUES('W019',419,'T1','F020');INSERT INTO watch_history VALUES('W020',420,'T15','F005');
INSERT INTO watch_history VALUES('W021',421,'T13','F022');INSERT INTO watch_history VALUES('W022',401,'T4','F010');
INSERT INTO watch_history VALUES('W023',403,'T12','F008');INSERT INTO watch_history VALUES('W024',405,'T2','F002');
INSERT INTO watch_history VALUES('W025',407,'T14','F019');INSERT INTO watch_history VALUES('W026',410,'T10','F001');
INSERT INTO watch_history VALUES('W027',412,'T3','F015');INSERT INTO watch_history VALUES('W028',415,'T7','F006');
INSERT INTO watch_history VALUES('W029',417,'T1','F003');INSERT INTO watch_history VALUES('W030',420,'T16','F011');
INSERT INTO watch_history VALUES('W031',402,'T9','F013');INSERT INTO watch_history VALUES('W032',404,'T8','F012');
INSERT INTO watch_history VALUES('W033',406,'T11','F016');INSERT INTO watch_history VALUES('W034',408,'T5','F004');
INSERT INTO watch_history VALUES('W035',409,'T17','F001');INSERT INTO watch_history VALUES('W036',411,'T2','F017');
INSERT INTO watch_history VALUES('W037',413,'T6','F008');INSERT INTO watch_history VALUES('W038',414,'T13','F009');
INSERT INTO watch_history VALUES('W039',416,'T4','F024');INSERT INTO watch_history VALUES('W040',418,'T15','F005');
INSERT INTO watch_history VALUES('W041',419,'T3','F010');INSERT INTO watch_history VALUES('W042',421,'T7','F019');
INSERT INTO watch_history VALUES('W043',422,'T1','F018');INSERT INTO watch_history VALUES('W044',423,null,'F022');
INSERT INTO watch_history VALUES('W045',424,'T12','F015');INSERT INTO watch_history VALUES('W046',425,'T9','F013');
INSERT INTO watch_history VALUES('W047',401,'T8','F005');INSERT INTO watch_history VALUES('W048',403,'T6','F021');
INSERT INTO watch_history VALUES('W049',412,'T10','F003');INSERT INTO watch_history VALUES('W050',420,'T4','F024');`,
university:`CREATE TABLE student(student_id INTEGER, last_name TEXT, first_name TEXT, major TEXT, enrollment_year INTEGER, gpa REAL, advisor_id INTEGER);
INSERT INTO student VALUES(1001,'Adams','Emma','Computer Science',2021,3.8,NULL);
INSERT INTO student VALUES(1002,'Brown','Noah','Business',2020,3.2,NULL);
INSERT INTO student VALUES(1003,'Clark','Olivia','Computer Science',2022,3.9,1001);
INSERT INTO student VALUES(1004,'Davis','Liam','Psychology',2021,3.5,NULL);
INSERT INTO student VALUES(1005,'Evans','Sophia','Biology',2023,3.7,NULL);
INSERT INTO student VALUES(1006,'Fisher','Jackson','Business',2020,2.9,1002);
INSERT INTO student VALUES(1007,'Green','Ava','Engineering',2022,3.6,NULL);
INSERT INTO student VALUES(1008,'Harris','Lucas','Computer Science',2023,3.4,1001);
INSERT INTO student VALUES(1009,'Irving','Mia','Biology',2021,3.8,1005);
INSERT INTO student VALUES(1010,'Jones','Ethan','Psychology',2022,3.1,1004);
INSERT INTO student VALUES(1011,'King','Isabella','Engineering',2020,3.7,1007);
INSERT INTO student VALUES(1012,'Lewis','Aiden','Business',2023,2.8,1002);
INSERT INTO student VALUES(1013,'Moore','Charlotte','Computer Science',2021,3.5,1001);
INSERT INTO student VALUES(1014,'Nelson','Mason','Biology',2022,3.9,1005);
INSERT INTO student VALUES(1015,'Owen','Amelia','Engineering',2023,3.3,1007);
INSERT INTO student VALUES(1016,'Parker','Logan','Psychology',2020,3.6,1004);
INSERT INTO student VALUES(1017,'Quinn','Elijah','Business',2021,3.0,1002);
INSERT INTO student VALUES(1018,'Reed','Aria','Computer Science',2022,3.7,1001);
INSERT INTO student VALUES(1019,'Scott','Oliver','Biology',2023,3.4,1005);
INSERT INTO student VALUES(1020,'Taylor','Luna','Engineering',2020,3.8,1007);
INSERT INTO student VALUES(1021,'Upton','James','Psychology',2021,3.2,1004);
INSERT INTO student VALUES(1022,'Vance','Layla','Business',2022,3.1,1002);
INSERT INTO student VALUES(1023,'Walsh','Sebastian','Computer Science',2023,3.6,1001);
INSERT INTO student VALUES(1024,'Young','Penelope','Biology',2020,3.9,1005);
INSERT INTO student VALUES(1025,'Zhang','Mateo','Engineering',2021,3.5,1007);

CREATE TABLE course(course_id TEXT, course_name TEXT, department TEXT, credits INTEGER, max_capacity INTEGER);
INSERT INTO course VALUES('CS101','Intro to Programming','Computer Science',3,40);
INSERT INTO course VALUES('CS201','Data Structures','Computer Science',3,35);
INSERT INTO course VALUES('CS301','Database Systems','Computer Science',3,30);
INSERT INTO course VALUES('CS401','Machine Learning','Computer Science',4,25);
INSERT INTO course VALUES('BUS101','Business Fundamentals','Business',3,50);
INSERT INTO course VALUES('BUS201','Marketing Principles','Business',3,45);
INSERT INTO course VALUES('BUS301','Financial Management','Business',3,35);
INSERT INTO course VALUES('BIO101','Cell Biology','Biology',4,40);
INSERT INTO course VALUES('BIO201','Genetics','Biology',4,30);
INSERT INTO course VALUES('BIO301','Ecology','Biology',3,35);
INSERT INTO course VALUES('ENG101','Engineering Principles','Engineering',4,40);
INSERT INTO course VALUES('ENG201','Circuits and Systems','Engineering',4,30);
INSERT INTO course VALUES('ENG301','Thermodynamics','Engineering',3,25);
INSERT INTO course VALUES('PSY101','Intro to Psychology','Psychology',3,60);
INSERT INTO course VALUES('PSY201','Cognitive Psychology','Psychology',3,40);

CREATE TABLE enrollment(enroll_id INTEGER, student_id INTEGER, course_id TEXT, semester TEXT, grade TEXT, score REAL);
INSERT INTO enrollment VALUES(1,1001,'CS101','Fall 2021','A',95.0);
INSERT INTO enrollment VALUES(2,1001,'CS201','Spring 2022','A',92.0);
INSERT INTO enrollment VALUES(3,1002,'BUS101','Fall 2020','B',82.0);
INSERT INTO enrollment VALUES(4,1003,'CS101','Fall 2022','A',98.0);
INSERT INTO enrollment VALUES(5,1003,'CS201','Spring 2023','A',96.0);
INSERT INTO enrollment VALUES(6,1004,'PSY101','Fall 2021','B+',87.0);
INSERT INTO enrollment VALUES(7,1005,'BIO101','Fall 2023','A',93.0);
INSERT INTO enrollment VALUES(8,1006,'BUS101','Fall 2020','C+',76.0);
INSERT INTO enrollment VALUES(9,1006,'BUS201','Spring 2021','B',80.0);
INSERT INTO enrollment VALUES(10,1007,'ENG101','Fall 2022','A-',91.0);
INSERT INTO enrollment VALUES(11,1008,'CS101','Fall 2023','B+',88.0);
INSERT INTO enrollment VALUES(12,1009,'BIO101','Fall 2021','A',94.0);
INSERT INTO enrollment VALUES(13,1009,'BIO201','Spring 2022','A',91.0);
INSERT INTO enrollment VALUES(14,1010,'PSY101','Fall 2022','B',83.0);
INSERT INTO enrollment VALUES(15,1011,'ENG101','Fall 2020','A-',90.0);
INSERT INTO enrollment VALUES(16,1011,'ENG201','Spring 2021','A',93.0);
INSERT INTO enrollment VALUES(17,1012,'BUS101','Fall 2023','C',72.0);
INSERT INTO enrollment VALUES(18,1013,'CS101','Fall 2021','B+',88.0);
INSERT INTO enrollment VALUES(19,1013,'CS301','Spring 2022','A-',91.0);
INSERT INTO enrollment VALUES(20,1014,'BIO101','Fall 2022','A',97.0);
INSERT INTO enrollment VALUES(21,1015,'ENG101','Fall 2023','B+',87.0);
INSERT INTO enrollment VALUES(22,1016,'PSY101','Fall 2020','A-',90.0);
INSERT INTO enrollment VALUES(23,1016,'PSY201','Spring 2021','A',92.0);
INSERT INTO enrollment VALUES(24,1017,'BUS101','Fall 2021','C+',77.0);
INSERT INTO enrollment VALUES(25,1018,'CS201','Fall 2022','A',94.0);
INSERT INTO enrollment VALUES(26,1018,'CS301','Spring 2023','A',96.0);
INSERT INTO enrollment VALUES(27,1019,'BIO101','Fall 2023','B+',88.0);
INSERT INTO enrollment VALUES(28,1020,'ENG101','Fall 2020','A',95.0);
INSERT INTO enrollment VALUES(29,1020,'ENG301','Spring 2021','A-',91.0);
INSERT INTO enrollment VALUES(30,1021,'PSY101','Fall 2021','B',82.0);
INSERT INTO enrollment VALUES(31,1022,'BUS201','Fall 2022','C+',75.0);
INSERT INTO enrollment VALUES(32,1023,'CS101','Fall 2023','A-',90.0);
INSERT INTO enrollment VALUES(33,1024,'BIO201','Fall 2020','A',97.0);
INSERT INTO enrollment VALUES(34,1024,'BIO301','Spring 2021','A',95.0);
INSERT INTO enrollment VALUES(35,1025,'ENG201','Fall 2021','B+',86.0);
INSERT INTO enrollment VALUES(36,1001,'CS301','Fall 2022','A',93.0);
INSERT INTO enrollment VALUES(37,1001,'CS401','Spring 2023','A',91.0);
INSERT INTO enrollment VALUES(38,1007,'ENG201','Spring 2023','A-',89.0);`
};
const SCHEMA={
ecommerce:{
  order:['product','customer','order_hdr','order_item'],
  tables:{
    product:{icon:'📦',label:'Products',bridge:false,alias:'pr',cols:[
      {id:'pr_id',  label:'Product ID',   type:'text',  expr:'pr.prod_id',  hide:true},
      {id:'pr_name',label:'Product Name', type:'text',  expr:'pr.prod_name'},
      {id:'pr_cat', label:'Category',     type:'text',  expr:'pr.category', opts:['Electronics','Sports','Kitchen','Office','Home','Books']},
      {id:'pr_stk', label:'Stock Qty',    type:'number',expr:'pr.stock_qty'},
      {id:'pr_price',label:'Unit Price ($)',type:'number',expr:'pr.unit_price'}
    ]},
    customer:{icon:'👤',label:'Customers',bridge:false,alias:'cu',cols:[
      {id:'cu_id',   label:'Customer ID', type:'number',expr:'cu.cust_id',   hide:true},
      {id:'cu_name', label:'Name',        type:'text',  expr:"cu.first_name||' '||cu.last_name"},
      {id:'cu_email',label:'Email',       type:'text',  expr:'cu.email'},
      {id:'cu_city', label:'City',        type:'text',  expr:'cu.city',      opts:['Toronto','New York','London','Madrid','Seoul','Berlin','Paris','Tokyo','Lagos','Rome']},
      {id:'cu_country',label:'Country',   type:'text',  expr:'cu.country',   opts:['Canada','US','UK','Spain','Korea','Germany','France','Japan','Nigeria','Italy']}
    ]},
    order_hdr:{icon:'🧾',label:'Orders',bridge:false,alias:'oh',cols:[
      {id:'oh_id',    label:'Order ID',   type:'number',expr:'oh.order_id'},
      {id:'oh_date',  label:'Order Date', type:'text',  expr:'oh.order_date'},
      {id:'oh_status',label:'Status',     type:'text',  expr:'oh.status',    opts:['Delivered','Shipped','Processing']}
    ]},
    order_item:{icon:'📋',label:'Order Items',bridge:false,alias:'oi',cols:[
      {id:'oi_qty',  label:'Quantity',          type:'number',expr:'oi.quantity'},
      {id:'oi_price',label:'Price Charged ($)',  type:'number',expr:'oi.price_charged'},
      {id:'oi_total',label:'Line Total ($)',      type:'number',expr:'ROUND(oi.quantity*oi.price_charged,2)'}
    ]}
  },
  edges:[
    {t1:'order_hdr', t2:'customer',  jtype:'INNER JOIN',on:'oh.cust_id   = cu.cust_id'},
    {t1:'order_item',t2:'order_hdr', jtype:'INNER JOIN',on:'oi.order_id  = oh.order_id'},
    {t1:'order_item',t2:'product',   jtype:'INNER JOIN',on:'oi.prod_id   = pr.prod_id'}
  ]
},
hospital:{
  order:['patient','doctor','appointment'],
  tables:{
    patient:{icon:'🏥',label:'Patients',bridge:false,alias:'pa',cols:[
      {id:'pa_id',    label:'Patient ID',  type:'number',expr:'pa.patient_id',hide:true},
      {id:'pa_name',  label:'Name',        type:'text',  expr:"pa.first_name||' '||pa.last_name"},
      {id:'pa_dob',   label:'Date of Birth',type:'text', expr:'pa.dob'},
      {id:'pa_gender',label:'Gender',      type:'text',  expr:'pa.gender',    opts:['M','F']},
      {id:'pa_city',  label:'City',        type:'text',  expr:'pa.city',      opts:['Chicago','Houston','Phoenix','Toronto','London','Sydney','Berlin','Paris','New York']},
      {id:'pa_country',label:'Country',    type:'text',  expr:'pa.country',   opts:['US','Canada','UK','Australia','Germany','France']}
    ]},
    doctor:{icon:'👨‍⚕️',label:'Doctors',bridge:false,alias:'dr',cols:[
      {id:'dr_id',   label:'Doctor ID',   type:'number',expr:'dr.doctor_id',  hide:true},
      {id:'dr_name', label:'Doctor Name', type:'text',  expr:"dr.first_name||' '||dr.last_name"},
      {id:'dr_spec', label:'Specialty',   type:'text',  expr:'dr.specialty',  opts:['Cardiology','Neurology','Pediatrics','Orthopedics','General Practice']},
      {id:'dr_target',label:'Patient Target',type:'number',expr:'dr.target_patients'}
    ]},
    appointment:{icon:'📅',label:'Appointments',bridge:false,alias:'ap',cols:[
      {id:'ap_id',    label:'Appt ID',    type:'number',expr:'ap.appt_id',  hide:true},
      {id:'ap_date',  label:'Appt Date',  type:'text',  expr:'ap.appt_date'},
      {id:'ap_diag',  label:'Diagnosis',  type:'text',  expr:'ap.diagnosis'},
      {id:'ap_fee',   label:'Fee ($)',     type:'number',expr:'ap.fee'}
    ]}
  },
  edges:[
    {t1:'appointment',t2:'patient',jtype:'INNER JOIN',on:'ap.patient_id = pa.patient_id'},
    {t1:'appointment',t2:'doctor', jtype:'INNER JOIN',on:'ap.doctor_id  = dr.doctor_id'}
  ]
},
movies:{
  order:['film','director','cast_link','viewer','watch_history','genre_tag'],
  tables:{
    film:{icon:'🎬',label:'Films',bridge:false,alias:'fi',cols:[
      {id:'fi_id',    label:'Film ID',       type:'text',  expr:'fi.film_id',    hide:true},
      {id:'fi_title', label:'Title',         type:'text',  expr:'fi.title'},
      {id:'fi_year',  label:'Release Year',  type:'number',expr:'fi.release_year'},
      {id:'fi_rating',label:'Rating',        type:'number',expr:'fi.rating'},
      {id:'fi_genre', label:'Genre',         type:'text',  expr:'fi.genre',      opts:['Sci-Fi','Drama','Thriller','Action','Horror','Comedy','Mystery','Romance']},
      {id:'fi_box',   label:'Box Office ($M)',type:'number',expr:'fi.box_office_m'},
      {id:'fi_run',   label:'Runtime (min)', type:'number',expr:'fi.runtime_min'}
    ]},
    director:{icon:'🎥',label:'Directors',bridge:false,alias:'di',cols:[
      {id:'di_id',    label:'Director ID',   type:'number',expr:'di.director_id', hide:true},
      {id:'di_name',  label:'Director Name', type:'text',  expr:'di.full_name'},
      {id:'di_nat',   label:'Nationality',   type:'text',  expr:'di.nationality', opts:['Nigerian','Mexican','Russian','British','Chinese','Algerian','Swedish','Pakistani','Japanese','Italian','Ghanaian','American','German','Korean','Bulgarian','Brazilian','Indian','Norwegian','Portuguese','Australian','Egyptian','Argentinian']},
      {id:'di_awards',label:'Awards Won',    type:'number',expr:'di.awards_won'},
      {id:'di_born',  label:'Birth Year',    type:'number',expr:'di.birth_year'}
    ]},
    cast_link:{icon:'🔗',label:'Film-Director link',bridge:true,alias:'cl',cols:[
      {id:'cl_contrib',label:'Contribution',type:'text',expr:'cl.contribution',opts:['Director','Producer','Executive Producer','Co-Director']}
    ]},
    genre_tag:{icon:'🏷',label:'Film Tags',bridge:false,alias:'gt',cols:[
      {id:'gt_name',label:'Tag',type:'text',expr:'gt.tag_name',opts:['suspenseful','emotional','visually stunning','thought-provoking','family-friendly','dark','inspiring','fast-paced','slow-burn','critically acclaimed','cult classic','award-winning','light-hearted','atmospheric','edge-of-seat','tearjerker','mind-bending','action-packed']}
    ]},
    viewer:{icon:'👤',label:'Viewers',bridge:false,alias:'vi',cols:[
      {id:'vi_id',    label:'Viewer ID',    type:'number',expr:'vi.viewer_id',  hide:true},
      {id:'vi_name',  label:'Viewer Name',  type:'text',  expr:'vi.full_name'},
      {id:'vi_country',label:'Country',     type:'text',  expr:'vi.country',    opts:['US','Canada','UK','China','Brazil','Norway','UAE','Australia','India','Korea','France','Japan','Italy','Ghana','Sweden','Turkey','Russia','Mexico','Lebanon','Ireland','Taiwan','South Africa','Portugal']},
      {id:'vi_member',label:'Membership',   type:'text',  expr:'vi.membership', opts:['Premium','Standard']},
      {id:'vi_year',  label:'Joined Year',  type:'number',expr:'vi.joined_year'}
    ]},
    watch_history:{icon:'▶️',label:'Watch History',bridge:false,alias:'wh',cols:[
      {id:'wh_id',label:'Watch ID',type:'text',expr:'wh.watch_id',hide:true}
    ]}
  },
  edges:[
    {t1:'film',         t2:'cast_link',    jtype:'INNER JOIN',on:'fi.film_id     = cl.film_id'},
    {t1:'director',     t2:'cast_link',    jtype:'INNER JOIN',on:'di.director_id = cl.director_id'},
    {t1:'film',         t2:'watch_history',jtype:'INNER JOIN',on:'fi.film_id     = wh.film_id'},
    {t1:'watch_history',t2:'viewer',       jtype:'INNER JOIN',on:'wh.viewer_id   = vi.viewer_id'},
    {t1:'watch_history',t2:'genre_tag',    jtype:'LEFT JOIN', on:'wh.tag_id      = gt.tag_id'}
  ]
},
university:{
  order:['student','course','enrollment'],
  tables:{
    student:{icon:'🎓',label:'Students',bridge:false,alias:'st',cols:[
      {id:'st_id',    label:'Student ID',    type:'number',expr:'st.student_id', hide:true},
      {id:'st_name',  label:'Name',          type:'text',  expr:"st.first_name||' '||st.last_name"},
      {id:'st_major', label:'Major',         type:'text',  expr:'st.major',      opts:['Computer Science','Business','Psychology','Biology','Engineering']},
      {id:'st_year',  label:'Enrollment Year',type:'number',expr:'st.enrollment_year'},
      {id:'st_gpa',   label:'GPA',           type:'number',expr:'st.gpa'}
    ]},
    course:{icon:'📚',label:'Courses',bridge:false,alias:'co',cols:[
      {id:'co_id',   label:'Course ID',    type:'text',  expr:'co.course_id'},
      {id:'co_name', label:'Course Name',  type:'text',  expr:'co.course_name'},
      {id:'co_dept', label:'Department',   type:'text',  expr:'co.department',  opts:['Computer Science','Business','Biology','Engineering','Psychology']},
      {id:'co_cred', label:'Credits',      type:'number',expr:'co.credits'},
      {id:'co_cap',  label:'Max Capacity', type:'number',expr:'co.max_capacity'}
    ]},
    enrollment:{icon:'📋',label:'Enrollments',bridge:false,alias:'en',cols:[
      {id:'en_id',    label:'Enroll ID',  type:'number',expr:'en.enroll_id', hide:true},
      {id:'en_sem',   label:'Semester',   type:'text',  expr:'en.semester'},
      {id:'en_grade', label:'Grade',      type:'text',  expr:'en.grade',    opts:['A','A-','B+','B','C+','C']},
      {id:'en_score', label:'Score',      type:'number',expr:'en.score'}
    ]}
  },
  edges:[
    {t1:'enrollment',t2:'student',jtype:'INNER JOIN',on:'en.student_id = st.student_id'},
    {t1:'enrollment',t2:'course', jtype:'INNER JOIN',on:'en.course_id  = co.course_id'}
  ]
}
};

// ── OPERATOR & AGGREGATE MAPS ──
const OPS_TEXT=[
  {label:'equals',       sql:'='},
  {label:'is not',       sql:'!='},
  {label:'contains',     sql:'LIKE_C'},
  {label:'starts with',  sql:'LIKE_S'},
  {label:'is blank',     sql:'IS_EMPTY'},
  {label:'has a value',  sql:'NOT_EMPTY'}
];
const OPS_NUM=[
  {label:'equals',       sql:'='},
  {label:'is not',       sql:'!='},
  {label:'is more than', sql:'>'},
  {label:'is at least',  sql:'>='},
  {label:'is less than', sql:'<'},
  {label:'is at most',   sql:'<='},
  {label:'is blank',     sql:'IS_EMPTY'},
  {label:'has a value',  sql:'NOT_EMPTY'}
];
const AGG_LABELS={'none':'— nothing —','COUNT':'Count','SUM':'Total','AVG':'Average','MIN':'Smallest','MAX':'Largest'};
const HAV_OPS=[
  {label:'is more than', sql:'>'},
  {label:'is at least',  sql:'>='},
  {label:'is less than', sql:'<'},
  {label:'is at most',   sql:'<='},
  {label:'equals',       sql:'='},
  {label:'is not',       sql:'!='}
];
const LIMITS=['10','25','50','All'];

// ── STATE ──
// state = { db, tables:[selected, in click order], cols:[visible column ids], filters:[{col,op,val}],
//           sort:{col,dir}|null, limit:'10'|'25'|'50'|'All',
//           group:{col, aggs:{colId:fn}, having:[{aggCol:'colId|FN',op,val}]}|null, distinct:bool }
function emptyState(db){ return {db, tables:[], cols:[], filters:[], sort:null, limit:'All', group:null, distinct:false}; }

// Tables that must be pulled in so every selected table is connected (shortest paths over the schema
// graph from the first selected table — identical to the original explorer's recomputeBridges()).
function bridgesFor(db, tables){
  const schema=SCHEMA[db]; const sel=(tables||[]).filter(t=>schema&&schema.tables[t]);
  if(!schema||sel.length<2) return [];
  const adj={};
  schema.edges.forEach(e=>{(adj[e.t1]=adj[e.t1]||[]).push(e.t2);(adj[e.t2]=adj[e.t2]||[]).push(e.t1);});
  const visited=new Set([sel[0]]), queue=[sel[0]], parent={};
  while(queue.length){const curr=queue.shift();for(const nb of(adj[curr]||[])){if(!visited.has(nb)){visited.add(nb);parent[nb]=curr;queue.push(nb);}}}
  const needed=new Set(sel);
  for(const t of sel){let c=t;while(c&&c!==sel[0]){needed.add(c);c=parent[c];}}
  const out=[]; for(const t of needed) if(!sel.includes(t)&&schema.tables[t]) out.push(t);
  return out;
}
function allTables(db, tables){ return [...(tables||[]), ...bridgesFor(db, tables)]; }
// Every column the controls can see: selected tables first (click order), then bridge tables.
function availableCols(db, tables){
  const schema=SCHEMA[db]; const cols=[]; if(!schema) return cols;
  allTables(db, tables).forEach(tn=>{const t=schema.tables[tn]; if(t) t.cols.forEach(c=>cols.push({...c,table:tn,tableLabel:t.label}));});
  return cols;
}
function defaultCols(db, tables){ return availableCols(db, tables).filter(c=>!c.hide).map(c=>c.id); }
function findCol(db, tables, id){ return availableCols(db, tables).find(c=>c.id===id); }

function buildFrom(db, tables){
  const schema=SCHEMA[db]; if(!schema) return null;
  const sel=(tables||[]).filter(t=>schema.tables[t]); if(!sel.length) return null;
  const allT=new Set(allTables(db, sel));
  const start=sel[0], tDef=schema.tables[start];
  if(allT.size===1) return start+' '+tDef.alias;
  const adj={};
  schema.edges.forEach(e=>{(adj[e.t1]=adj[e.t1]||[]).push({nb:e.t2,e});(adj[e.t2]=adj[e.t2]||[]).push({nb:e.t1,e});});
  const visited=new Set([start]), queue=[start], joins=[];
  while(queue.length){
    const curr=queue.shift();
    for(const{nb,e} of(adj[curr]||[])){
      if(!visited.has(nb)&&allT.has(nb)){
        visited.add(nb);queue.push(nb);
        joins.push((e.jtype||'INNER JOIN')+' '+nb+' '+schema.tables[nb].alias+' ON '+e.on);
      }
    }
  }
  return start+' '+tDef.alias+' '+joins.join(' ');
}

function opToSQL(col,op,val){
  const ex=col.expr;
  const v=String(val==null?'':val);
  const safe=v.replace(/'/g,"''");
  switch(op){
    case 'equals':      return col.type==='number'?ex+'='+Number(v):ex+"='"+safe+"'";
    case 'is not':      return col.type==='number'?ex+'!='+Number(v):ex+"!='"+safe+"'";
    case 'is more than':return ex+'>'+Number(v);
    case 'is at least': return ex+'>='+Number(v);
    case 'is less than':return ex+'<'+Number(v);
    case 'is at most':  return ex+'<='+Number(v);
    case 'contains':    return ex+" LIKE '%"+safe.replace(/%/g,'\\%')+"%'";
    case 'starts with': return ex+" LIKE '"+safe.replace(/%/g,'\\%')+"%'";
    case 'is blank':    return '('+ex+" IS NULL OR CAST("+ex+" AS TEXT)='')";
    case 'has a value': return '('+ex+" IS NOT NULL AND CAST("+ex+" AS TEXT)!='')";
  }
  return null;
}

// Click state → the single SELECT the explorer runs. Same text the original explorer produced, so
// tests/fixtures.json pins the generator (see check.mjs).
function buildSQL(state){
  const db=state.db; const tables=(state.tables||[]).filter(t=>SCHEMA[db]&&SCHEMA[db].tables[t]);
  const fromSQL=buildFrom(db, tables); if(!fromSQL) return {sql:null, error:'no tables selected'};
  const allCols=availableCols(db, tables);
  const visible=state.cols||[];
  const selCols=allCols.filter(c=>visible.includes(c.id));
  if(!selCols.length) return {sql:null, error:'no columns chosen'};
  const group=state.group&&state.group.col?state.group:null;
  const aggFns=group?(group.aggs||{}):{};
  let selectExpr; const extraGroupByCols=[];
  if(group){
    const gbCol=allCols.find(c=>c.id===group.col);
    const parts=[];
    if(gbCol) parts.push(gbCol.expr+' AS "'+gbCol.label+'"');
    selCols.forEach(c=>{ if(c.id===group.col) return; if(c.type!=='number'){ parts.push(c.expr+' AS "'+c.label+'"'); extraGroupByCols.push(c.expr); } });
    let hasAgg=false;
    selCols.forEach(c=>{ if(c.id===group.col) return; const fn=aggFns[c.id]; if(fn&&fn!=='none'){ parts.push(fn+'('+c.expr+') AS "'+AGG_LABELS[fn]+' of '+c.label+'"'); hasAgg=true; } });
    if(!hasAgg) parts.push('COUNT(*) AS "Count"');
    selectExpr=parts.join(', ');
  } else {
    selectExpr=(state.distinct?'DISTINCT ':'')+selCols.map(c=>c.expr+' AS "'+c.label+'"').join(', ');
  }
  let sql='SELECT '+selectExpr+' FROM '+fromSQL;
  const conds=(state.filters||[]).map(f=>{const col=allCols.find(c=>c.id===f.col); if(!col) return null; return opToSQL(col,f.op,f.val);}).filter(Boolean);
  if(conds.length) sql+=' WHERE '+conds.join(' AND ');
  if(group){
    const gbCol=allCols.find(c=>c.id===group.col);
    if(gbCol) sql+=' GROUP BY '+[gbCol.expr,...extraGroupByCols].join(', ');
    const havConds=(group.having||[]).map(h=>{
      const parts=String(h.aggCol||'').split('|'); const cid=parts[0], fn=parts[1]; const col=allCols.find(c=>c.id===cid);
      if(!col||!fn) return null;
      const havOp=HAV_OPS.find(o=>o.label===h.op);
      return havOp?fn+'('+col.expr+')'+havOp.sql+Number(h.val):null;
    }).filter(Boolean);
    if(havConds.length) sql+=' HAVING '+havConds.join(' AND ');
  }
  if(state.sort&&state.sort.col){ const col=allCols.find(c=>c.id===state.sort.col); if(col) sql+=' ORDER BY '+col.expr+' '+(state.sort.dir==='DESC'?'DESC':'ASC'); }
  if(state.limit&&state.limit!=='All') sql+=' LIMIT '+state.limit;
  return {sql};
}

// ── SQL DISPLAY (Oracle-style layout; LIMIT is shown as a ROWNUM comment because Oracle has no LIMIT) ──
function formatSQL(sql) {
  sql = sql.replace(/\bLIMIT\s+(\d+)\b/gi, function(m,n){ return '/* Top ' + n + ' rows via ROWNUM */'; });
  const CLAUSE = /\b(SELECT DISTINCT|SELECT|FROM|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL OUTER JOIN|FULL JOIN|JOIN|ON|WHERE|AND|OR|GROUP BY|HAVING|ORDER BY)\b/gi;
  const NL = '\n';
  const mainClauses  = ['SELECT','SELECT DISTINCT','FROM','WHERE','GROUP BY','HAVING','ORDER BY'];
  const joinClauses  = ['INNER JOIN','LEFT JOIN','RIGHT JOIN','FULL OUTER JOIN','FULL JOIN','JOIN'];
  let parts = sql.replace(/\s+/g,' ').trim().split(CLAUSE);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p) continue;
    const upper = p.toUpperCase();
    if (mainClauses.indexOf(upper) >= 0) out += (out ? NL : '') + upper;
    else if (joinClauses.indexOf(upper) >= 0) out += NL + upper;
    else if (upper === 'ON') out += NL + '    ON';
    else if (upper === 'AND') out += NL + '  AND';
    else if (upper === 'OR') out += NL + '   OR';
    else {
      const prev = (i > 0 ? parts[i-1] : '').trim().toUpperCase();
      if (prev === 'SELECT' || prev === 'SELECT DISTINCT') {
        const cols = p.split(',').map(function(c){ return c.trim(); });
        out += NL + '  ' + cols.join(',' + NL + '  ');
      } else out += ' ' + p;
    }
  }
  return out.trim();
}

// ── PRACTICE GRADER ──
// Compares two result sets {columns, rows}. Column order never matters: columns are matched by header
// name when every expected header is present (case-insensitive), otherwise each row is compared as a
// sorted bag of values (reported as byValue:true). Row order matters only when `ordered` is true
// (the task has an ORDER BY). Numbers compare with a 1e-9 tolerance; everything else exactly.
const SEP=String.fromCharCode(1), NULLKEY=String.fromCharCode(0)+'null';
function normCell(v){
  if(v===null||v===undefined) return null;
  if(typeof v==='number') return Number.isInteger(v)?v:Math.round(v*1e9)/1e9;
  if(typeof v==='bigint') return Number(v);
  return String(v);
}
function cellKey(v){ v=normCell(v); return v===null?NULLKEY:(typeof v==='number'?'n:'+v:'s:'+v); }
function grade(expected, actual, opts){
  const ordered=!!(opts&&opts.ordered);
  const ec=expected.columns||[], ac=actual.columns||[];
  const out={ok:false, ordered, byValue:false, colMap:null, missing:[], extra:[], firstDiff:-1, unmatchedColumns:[],
             expectedRows:(expected.rows||[]).length, actualRows:(actual.rows||[]).length, reason:''};
  if(ec.length!==ac.length){ out.reason='column count: expected '+ec.length+', got '+ac.length; return out; }
  const norm=s=>String(s).replace(/^"|"$/g,'').trim().toLowerCase();
  const aIdx=ac.map(norm); const map=ec.map(c=>aIdx.indexOf(norm(c)));
  let rowKey;
  if(map.every(i=>i>=0)&&new Set(map).size===map.length){
    out.colMap=map; rowKey=(row,isActual)=>(isActual?map.map(i=>row[i]):row).map(cellKey).join(SEP);
  } else {
    out.byValue=true; rowKey=row=>row.map(cellKey).sort().join(SEP);
  }
  // Column hints: an expected column is "matched" when some column of the answer holds the same multiset of
  // values (order-insensitive). Lets the verdict say *which* column is wrong instead of only "3 missing, 3 extra".
  const bag=(rows,i)=>rows.map(r=>cellKey(r[i])).sort().join(SEP);
  const aBags=ac.map((_,j)=>bag(actual.rows||[],j));
  out.unmatchedColumns=ec.filter((_,i)=>!aBags.includes(bag(expected.rows||[],i)));
  const eKeys=(expected.rows||[]).map(r=>rowKey(r,false)), aKeys=(actual.rows||[]).map(r=>rowKey(r,true));
  if(ordered){
    const n=Math.max(eKeys.length,aKeys.length);
    for(let i=0;i<n;i++){ if(eKeys[i]!==aKeys[i]){ out.firstDiff=i; break; } }
    if(out.firstDiff<0){ out.ok=true; out.reason=out.byValue?'match (row order checked; columns matched by value, not by name)':'match (row order checked)'; return out; }
  }
  const count=new Map(); eKeys.forEach(k=>count.set(k,(count.get(k)||0)+1));
  aKeys.forEach((k,i)=>{ const c=count.get(k)||0; if(c>0) count.set(k,c-1); else out.extra.push(i); });
  eKeys.forEach((k,i)=>{ if((count.get(k)||0)>0){ out.missing.push(i); count.set(k,count.get(k)-1); } });
  if(ordered){
    out.reason=(out.missing.length||out.extra.length)?(out.missing.length+' missing, '+out.extra.length+' extra'):('same rows, different order (first difference at row '+(out.firstDiff+1)+')');
    return out;
  }
  out.ok=!out.missing.length&&!out.extra.length;
  out.reason=out.ok?(out.byValue?'match (columns matched by value, not by name)':'match'):(out.missing.length+' missing, '+out.extra.length+' extra');
  return out;
}
// Practice mode accepts exactly one read-only statement.
function isSelectOnly(sql){
  const s=String(sql||'').trim().replace(/;\s*$/,'');
  if(!s||s.includes(';')) return false;
  return /^(select|with)\b/i.test(s);
}

// ── URL CODEC ──  ?db=movies&tables=film,director&q=<base64url json>&mode=practice
function b64uEncode(str){ const b=typeof Buffer!=='undefined'?Buffer.from(str,'utf8').toString('base64'):btoa(unescape(encodeURIComponent(str))); return b.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64uDecode(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; return typeof Buffer!=='undefined'?Buffer.from(s,'base64').toString('utf8'):decodeURIComponent(escape(atob(s))); }
function encodeState(state, mode){
  const p=new URLSearchParams();
  p.set('db', state.db);
  if(state.tables&&state.tables.length) p.set('tables', state.tables.join(','));
  const q={};
  const dflt=defaultCols(state.db, state.tables||[]);
  if(state.cols&&state.cols.join('|')!==dflt.join('|')) q.c=state.cols;
  if(state.filters&&state.filters.length) q.f=state.filters.map(f=>[f.col,f.op,f.val==null?'':String(f.val)]);
  if(state.sort&&state.sort.col) q.s=[state.sort.col, state.sort.dir==='DESC'?'DESC':'ASC'];
  if(state.limit&&state.limit!=='All') q.l=state.limit;
  if(state.group&&state.group.col){ q.g=state.group.col; const a=Object.entries(state.group.aggs||{}).filter(([,v])=>v&&v!=='none'); if(a.length) q.a=a; const h=(state.group.having||[]).map(x=>[x.aggCol,x.op,x.val==null?'':String(x.val)]); if(h.length) q.h=h; }
  if(state.distinct) q.d=1;
  if(Object.keys(q).length) p.set('q', b64uEncode(JSON.stringify(q)));
  if(mode==='practice') p.set('mode','practice');
  return '?'+p.toString();
}
// Everything is validated against the schema; unknown tables/columns/operators are dropped, never trusted.
function decodeState(search){
  const p=new URLSearchParams(String(search||'').replace(/^\?/,''));
  const db=SCHEMA[p.get('db')]?p.get('db'):'hospital';
  const schema=SCHEMA[db];
  const tables=[]; (p.get('tables')||'').split(',').map(s=>s.trim()).filter(Boolean).forEach(t=>{ if(schema.tables[t]&&!schema.tables[t].bridge&&!tables.includes(t)) tables.push(t); });
  const st=emptyState(db); st.tables=tables; st.cols=defaultCols(db, tables);
  const mode=p.get('mode')==='practice'?'practice':'explore';
  let q={}; try{ if(p.get('q')) q=JSON.parse(b64uDecode(p.get('q')))||{}; }catch(e){ q={}; }
  if(!q||typeof q!=='object') q={};
  const cols=availableCols(db, tables); const byId=id=>cols.find(c=>c.id===id);
  if(Array.isArray(q.c)){ const c=q.c.filter(id=>byId(id)); if(c.length) st.cols=c; }
  if(Array.isArray(q.f)) st.filters=q.f.filter(f=>Array.isArray(f)&&byId(f[0])).map(f=>{ const col=byId(f[0]); const ops=col.type==='number'?OPS_NUM:OPS_TEXT; return {col:f[0], op:ops.some(o=>o.label===f[1])?f[1]:'equals', val:String(f[2]==null?'':f[2])}; });
  if(Array.isArray(q.s)&&byId(q.s[0])) st.sort={col:q.s[0], dir:q.s[1]==='DESC'?'DESC':'ASC'};
  if(LIMITS.includes(String(q.l))) st.limit=String(q.l);
  if(q.g&&byId(q.g)){
    const aggs={}; (Array.isArray(q.a)?q.a:[]).forEach(a=>{ if(!Array.isArray(a)) return; const id=a[0], fn=a[1]; const c=byId(id); if(c&&c.type==='number'&&id!==q.g&&AGG_LABELS[fn]&&fn!=='none') aggs[id]=fn; });
    const having=(Array.isArray(q.h)?q.h:[]).filter(h=>Array.isArray(h)&&aggs[String(h[0]).split('|')[0]]===String(h[0]).split('|')[1]&&HAV_OPS.some(o=>o.label===h[1])).map(h=>({aggCol:h[0],op:h[1],val:String(h[2]==null?'':h[2])}));
    st.group={col:q.g, aggs, having};
  }
  st.distinct=q.d===1||q.d==='1'||q.d===true;
  return {state:st, mode};
}

return { VERSION, DDL, SCHEMA, OPS_TEXT, OPS_NUM, AGG_LABELS, HAV_OPS, LIMITS,
         emptyState, bridgesFor, allTables, availableCols, defaultCols, findCol, buildFrom, opToSQL, buildSQL,
         formatSQL, grade, isSelectOnly, encodeState, decodeState };
});
