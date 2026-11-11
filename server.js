
const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());

let db;

// Initialize SQLite database
async function initializeDatabase() {
  db = await open({
    filename: path.join(__dirname, 'books.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS book (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      price REAL NOT NULL,
      pages INTEGER NOT NULL
    )
  `);

  // Add sample books only when the table is empty
  const result = await db.get('SELECT COUNT(*) AS count FROM book');

  if (result.count === 0) {
    await db.run(
      `INSERT INTO book (title, author, price, pages)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)`,
      'The Alchemist', 'Paulo Coelho', 250, 208,
      'Wings of Fire', 'A.P.J. Abdul Kalam', 300, 180,
      'Atomic Habits', 'James Clear', 450, 320
    );
  }

  console.log('Database connected successfully');
}

// Check book ID
function validId(id) {
  return Number.isInteger(Number(id)) && Number(id) > 0;
}

// Validate book information
function validateBook(data) {
  const { title, author, price, pages } = data;

  if (
    typeof title !== 'string' || !title.trim() ||
    typeof author !== 'string' || !author.trim() ||
    price === undefined || !Number.isFinite(Number(price)) ||
    Number(price) < 0 ||
    pages === undefined || !Number.isInteger(Number(pages)) ||
    Number(pages) <= 0
  ) {
    return 'Provide a valid title, author, non-negative price and positive page count.';
  }

  return null;
}

// Home route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Books REST API',
    endpoints: [
      'GET /about',
      'GET /books',
      'GET /books/:id',
      'POST /books',
      'PUT /books/:id',
      'DELETE /books/:id'
    ]
  });
});

// About route
app.get('/about', (req, res) => {
  res.json({
    project: 'Lab 3 - Books REST API',
    technology: 'Node.js, Express and SQLite',
    student: 'Enter your name here',
    registrationNumber: 'Enter your registration number here'
  });
});

// Get all books with search, sorting and pagination
app.get('/books', async (req, res) => {
  try {
    const {
      search_q,
      order_by = 'id',
      order = 'ASC',
      limit = 10,
      offset = 0,
      min_price,
      max_price
    } = req.query;

    const allowedColumns = ['id', 'title', 'author', 'price', 'pages'];
    const sortColumn = allowedColumns.includes(order_by) ? order_by : 'id';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const pageLimit = Number(limit);
    const pageOffset = Number(offset);

    if (
      !Number.isInteger(pageLimit) || pageLimit < 1 ||
      !Number.isInteger(pageOffset) || pageOffset < 0
    ) {
      return res.status(400).json({
        error: 'Limit must be a positive integer and offset must be a non-negative integer.'
      });
    }

    const conditions = [];
    const params = [];

    if (search_q) {
      conditions.push('(title LIKE ? OR author LIKE ?)');
      params.push(`%${search_q}%`, `%${search_q}%`);
    }

    if (min_price !== undefined) {
      if (!Number.isFinite(Number(min_price)) || Number(min_price) < 0) {
        return res.status(400).json({ error: 'Invalid min_price' });
      }
      conditions.push('price >= ?');
      params.push(Number(min_price));
    }

    if (max_price !== undefined) {
      if (!Number.isFinite(Number(max_price)) || Number(max_price) < 0) {
        return res.status(400).json({ error: 'Invalid max_price' });
      }
      conditions.push('price <= ?');
      params.push(Number(max_price));
    }

    if (
      min_price !== undefined && max_price !== undefined &&
      Number(min_price) > Number(max_price)
    ) {
      return res.status(400).json({
        error: 'min_price cannot be greater than max_price'
      });
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const books = await db.all(
      `SELECT * FROM book ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, pageLimit, pageOffset]
    );

    res.json({
      count: books.length,
      books
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve books' });
  }
});

// Get one book by ID
app.get('/books/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }

    const book = await db.get(
      'SELECT * FROM book WHERE id = ?',
      Number(req.params.id)
    );

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.json(book);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve book' });
  }
});

// Add a new book
app.post('/books', async (req, res) => {
  try {
    const error = validateBook(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    const { title, author, price, pages } = req.body;

    const result = await db.run(
      `INSERT INTO book (title, author, price, pages)
       VALUES (?, ?, ?, ?)`,
      title.trim(),
      author.trim(),
      Number(price),
      Number(pages)
    );

    const newBook = await db.get(
      'SELECT * FROM book WHERE id = ?',
      result.lastID
    );

    res.status(201).json({
      message: 'Book added successfully',
      book: newBook
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add book' });
  }
});

// Update a book
app.put('/books/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }

    const error = validateBook(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    const { title, author, price, pages } = req.body;

    const result = await db.run(
      `UPDATE book
       SET title = ?, author = ?, price = ?, pages = ?
       WHERE id = ?`,
      title.trim(),
      author.trim(),
      Number(price),
      Number(pages),
      Number(req.params.id)
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const updatedBook = await db.get(
      'SELECT * FROM book WHERE id = ?',
      Number(req.params.id)
    );

    res.json({
      message: 'Book updated successfully',
      book: updatedBook
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// Delete a book
app.delete('/books/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }

    const result = await db.run(
      'DELETE FROM book WHERE id = ?',
      Number(req.params.id)
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// Start server after database initialization
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
  });
