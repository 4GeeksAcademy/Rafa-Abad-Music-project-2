export const Footer = () => (
  <footer className="footer mt-auto py-3 bg-dark text-light">
    <div className="container text-center">

      {/* About Us dropdown */}
      <div className="dropdown d-inline-block">
        <button 
          className="btn btn-secondary dropdown-toggle" 
          type="button" 
          id="aboutDropdown" 
          data-bs-toggle="dropdown" 
          aria-expanded="false"
        >
          About Us
        </button>
        <ul className="dropdown-menu" aria-labelledby="aboutDropdown">
          <li>
            <a 
              className="dropdown-item" 
              href="https://github.com/your-username" 
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </li>
          <li>
            <a 
              className="dropdown-item" 
              href="mailto:your-email@example.com"
            >
              Email
            </a>
          </li>
          <li>
            <a 
              className="dropdown-item" 
              href="https://linkedin.com/in/your-linkedin"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
          </li>
        </ul>
      </div>

      
    </div>
  </footer>
);