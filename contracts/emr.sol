// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title EMRSystem - Blockchain-based Electronic Medical Record Management System
/// @notice Securely manages doctor/patient registration and records on Ethereum.
/// @dev Updated to prevent admin (owner) from registering as doctor/patient.

contract EMRSystem {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    // ------------------- STRUCTS -------------------
    struct Doctor {
        string name;
        string specialization;
        bool registered;
    }

    struct Patient {
        string name;
        bool registered;
    }

    struct MedicalRecord {
        uint256 recordId;
        address patient;
        address doctor;
        string diagnosis;
        string treatment;
        string dateOfVisit;
        string ipfsHash; // optional encrypted data or IPFS hash
    }

    // ------------------- STATE VARIABLES -------------------
    uint256 public recordCount = 0;
    mapping(address => Doctor) public doctors;
    mapping(address => Patient) public patients;
    mapping(uint256 => MedicalRecord) public records;

    // Access control: patient => viewer => allowed
    mapping(address => mapping(address => bool)) public accessPermissions;

    // ------------------- EVENTS -------------------
    event DoctorRegistered(address doctor, string name, string specialization);
    event PatientRegistered(address patient, string name);
    event RecordCreated(uint256 recordId, address doctor, address patient);
    event RecordUpdated(uint256 recordId, string diagnosis, string treatment);
    event AccessGranted(address patient, address viewer);
    event AccessRevoked(address patient, address viewer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ------------------- MODIFIERS -------------------
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyDoctor() {
        require(doctors[msg.sender].registered, "Not a registered doctor");
        _;
    }

    modifier onlyPatient() {
        require(patients[msg.sender].registered, "Not a registered patient");
        _;
    }

    // ------------------- REGISTRATION -------------------
    function registerDoctor(string memory _name, string memory _specialization) external {
        require(msg.sender != owner, "Owner cannot register as doctor");
        require(!doctors[msg.sender].registered, "Doctor already registered");
        require(!patients[msg.sender].registered, "Already registered as patient");
        doctors[msg.sender] = Doctor(_name, _specialization, true);
        emit DoctorRegistered(msg.sender, _name, _specialization);
    }

    function registerPatient(string memory _name) external {
        require(msg.sender != owner, "Owner cannot register as patient");
        require(!patients[msg.sender].registered, "Patient already registered");
        require(!doctors[msg.sender].registered, "Already registered as doctor");
        patients[msg.sender] = Patient(_name, true);
        emit PatientRegistered(msg.sender, _name);
    }

    // ------------------- RECORD MANAGEMENT -------------------
    function createRecord(
        address _patient,
        string memory _diagnosis,
        string memory _treatment,
        string memory _dateOfVisit,
        string memory _ipfsHash
    ) external onlyDoctor {
        require(patients[_patient].registered, "Patient not registered");
        recordCount++;
        records[recordCount] = MedicalRecord(
            recordCount,
            _patient,
            msg.sender,
            _diagnosis,
            _treatment,
            _dateOfVisit,
            _ipfsHash
        );

        // Grant patient and doctor automatic access
        accessPermissions[_patient][_patient] = true;
        accessPermissions[_patient][msg.sender] = true;
        emit RecordCreated(recordCount, msg.sender, _patient);
    }

    function updateRecord(
        uint256 _recordId,
        string memory _diagnosis,
        string memory _treatment
    ) external onlyDoctor {
        MedicalRecord storage record = records[_recordId];
        require(record.recordId != 0, "Record does not exist");
        require(record.doctor == msg.sender, "Only creator doctor can update");
        record.diagnosis = _diagnosis;
        record.treatment = _treatment;
        emit RecordUpdated(_recordId, _diagnosis, _treatment);
    }

    // ------------------- ACCESS CONTROL -------------------
    function grantAccess(address _viewer) external onlyPatient {
        accessPermissions[msg.sender][_viewer] = true;
        emit AccessGranted(msg.sender, _viewer);
    }

    function revokeAccess(address _viewer) external onlyPatient {
        accessPermissions[msg.sender][_viewer] = false;
        emit AccessRevoked(msg.sender, _viewer);
    }

    // ------------------- VIEW RECORD -------------------
    function viewRecord(uint256 _recordId)
        external
        view
        returns (
            uint256 recordId,
            address patient,
            address doctor,
            string memory diagnosis,
            string memory treatment,
            string memory dateOfVisit,
            string memory ipfsHash
        )
    {
        MedicalRecord memory record = records[_recordId];
        require(record.recordId != 0, "Record not found");
        require(
            accessPermissions[record.patient][msg.sender] ||
                msg.sender == record.patient ||
                msg.sender == record.doctor ||
                msg.sender == owner,
            "Access denied"
        );
        return (
            record.recordId,
            record.patient,
            record.doctor,
            record.diagnosis,
            record.treatment,
            record.dateOfVisit,
            record.ipfsHash
        );
    }

    // ------------------- OWNERSHIP -------------------
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid new owner");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }
}
