
require('dotenv').config();
const { faker } = require('@faker-js/faker');
const mysql = require('mysql2');
const express = require("express");
const path = require("path");
const methodOverride = require("method-override");
const bcrypt = require('bcrypt');

const app = express();

// Middleware setup
app.use(methodOverride("_method"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));
app.use(express.static(path.join(__dirname, 'public')));

// MySQL connection pool


const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD
});


// Helper function
let getRandomUser = () => {
  return [
    faker.string.uuid(),
    faker.internet.userName(),
    faker.internet.email(),
    faker.internet.password()
  ];
};

// Home route with search functionality
app.get("/", (req, res) => {
  const { search } = req.query;
  const countQuery = 'SELECT COUNT(*) AS count FROM user';
  const searchQuery = 'SELECT * FROM user WHERE username LIKE ? OR email LIKE ?';

  pool.query(countQuery, (err, countResult) => {
    if (err) return res.send("Error in count query");

    const count = countResult[0].count;

    if (search) {
      const pattern = `%${search}%`;
      pool.query(searchQuery, [pattern, pattern], (err, users) => {
        if (err) return res.send("Error in search query");
        res.render("home.ejs", { count, users: users || [], search: true });
      });
    } else {
      res.render("home.ejs", { count, users: [], search: false });
    }
  });
});

// Show all users
app.get("/user", (req, res) => {
  const { search } = req.query; // Capture the search query from the URL
  const q = 'SELECT * FROM user';

  pool.query(q, (err, users) => {
    if (err) return res.send("Error fetching users");

    // If there's a search query, filter users accordingly
    const filteredUsers = search
      ? users.filter(user =>
          user.username.toLowerCase().includes(search.toLowerCase()) ||
          user.email.toLowerCase().includes(search.toLowerCase())
        )
      : users;

    // Render the view with the filtered users and the search term
    res.render("users.ejs", { users: filteredUsers, search });
  });
});



// Show edit form
app.get("/user/:id/edit", (req, res) => {
  const { id } = req.params;
  const q = 'SELECT * FROM user WHERE id = ?';
  pool.query(q, [id], (err, result) => {
    if (err) return res.send("Error fetching user");
    const user = result[0];
    res.render("edit.ejs", { user });
  });
});

// Update user
app.patch("/user/:id", (req, res) => {
  const { id } = req.params;
  const { password: formPass, username: newUsername } = req.body;
  const getUserQuery = 'SELECT * FROM user WHERE id = ?';
  const updateUserQuery = 'UPDATE user SET username = ? WHERE id = ?';

  pool.query(getUserQuery, [id], async (err, result) => {
    if (err) return res.send("Error fetching user for update");

    const user = result[0];
    const match = await bcrypt.compare(formPass, user.password);
    if (!match) return res.send("Incorrect password. Update failed.");

    pool.query(updateUserQuery, [newUsername, id], (err) => {
      if (err) return res.send("Error updating user");
      res.redirect("/user");
    });
  });
});

// Add new user
app.post("/user", async (req, res) => {
  const id = faker.string.uuid();
  const { username, email, password } = req.body;

  const checkQuery = 'SELECT * FROM user WHERE username = ? OR email = ?';
  const insertQuery = 'INSERT INTO user(id, username, email, password) VALUES (?, ?, ?, ?)';
  const countQuery = 'SELECT COUNT(*) AS count FROM user';

  try {
    pool.query(checkQuery, [username, email], async (err, results) => {
      if (err) return res.send("Error checking duplicates");

      if (results.length > 0) {
        pool.query(countQuery, (err, countResult) => {
          if (err) return res.send("Error getting count");
          const count = countResult[0].count;
          return res.render("home.ejs", {
            count,
            users: [],
            search: false,
            warning: "Username or Email already exists!"
          });
        });
      } else {
        const hashedPassword = await bcrypt.hash(password, 10);
        pool.query(insertQuery, [id, username, email, hashedPassword], (err) => {
          if (err) {
            console.error("Insert error:", err);
            return res.send("Error inserting new user");
          }
          res.redirect("/user");
        });
      }
    });
  } catch (err) {
    console.error("Outer error:", err);
    res.send("Some error occurred.");
  }
});



// Show delete confirmation form
app.get("/user/:id/delete", (req, res) => {
  const { id } = req.params;
  const q = 'SELECT * FROM user WHERE id = ?';
  pool.query(q, [id], (err, result) => {
    if (err) return res.send("Error fetching user for delete");
    const user = result[0];
    res.render("delete.ejs", { user });
  });
});


// Delete user
app.delete('/user/:id', (req, res) => {
  const { password } = req.body;
  const userId = req.params.id;
  const getUserQuery = 'SELECT * FROM user WHERE id = ?';
  const deleteUserQuery = 'DELETE FROM user WHERE id = ?';

  pool.query(getUserQuery, [userId], async (err, results) => {
    if (err) return res.send("Error retrieving user");
    if (results.length === 0) return res.send("User not found");

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Incorrect password. Cannot delete account.");

    pool.query(deleteUserQuery, [userId], (err) => {
      if (err) return res.send("Error deleting user");
      res.redirect("/user");
    });
  });
});





// Start server
app.listen("8080", () => {
  console.log("Server is listening on port 8080");
});
