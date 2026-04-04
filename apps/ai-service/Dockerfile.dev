# Base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy file
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 50055

# Run app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "50055"]