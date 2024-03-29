const Validate = require("../validate");

const HomeRun = require("./HomeRun");
const RunResult = require("./RunResult");
const ClubsEnums = require("../common/ClubsEnums");

const NetError = require("../errors/ParkrunNetError");
const DataNotAvailableError = require("../errors/ParkrunDataNotAvailableError");

const AthleteExpandedSchema = require("../schemas/AthleteExpanded");

// Importing for IntelliSense
const AxiosInstance = require("axios").default;

const capitalize = str =>
  str.toLowerCase().replace(/^\w/, c => c.toUpperCase());

/**
 * A class representing a Parkrun User.
 */
class User {
  /**
   * Create a new User class from the API responses.
   *
   * @param {*} res the API response
   * @param {Parkrun} core parkrun.js instance
   * @returns {User} the new user class
   *
   * @throws {ParkrunValidationError} ParkrunJS Validation Error - API response was not what was expected.
   */
  constructor(res, core) {
    const data = Validate(res, AthleteExpandedSchema).data.Athletes[0];

    this._athleteID = Number.parseInt(data.AthleteID);
    this._avatar = data.Avatar;
    this._clubName = data.ClubName;
    this._firstName = data.FirstName;
    this._homeRun = new HomeRun(
      data.HomeRunID,
      data.HomeRunLocation,
      data.HomeRunName
    );
    this._lastName = data.LastName;

    this._core = core;
  }

  /**
   * Get the user's Athlete ID.
   *
   * @returns {Number}
   */
  getID() {
    return this._athleteID;
  }

  /**
   * Get the URL for the user's avatar.
   *
   * @returns {String} URL
   */
  getAvatar() {
    return this._avatar;
  }

  /**
   * Get the user's club name
   *
   * @returns {String} club name
   */
  getClubName() {
    return this._clubName;
  }

  /**
   * Get the user's first name
   *
   * @returns {String} first name
   */
  getFirstName() {
    return capitalize(this._firstName);
  }

  /**
   * Get the Home Run object for this user.
   *
   * @returns {HomeRun} HomeRun object
   */
  getHomeRun() {
    return this._homeRun;
  }

  /**
   * Get the user's last name
   *
   * @returns {String} last name
   */
  getLastName() {
    return capitalize(this._lastName);
  }

  /**
   * Get the user's gender.
   *
   * @deprecated As of #33 (Feb '20), this endpoint is no longer supported by Parkrun and will now result in an error.
   * @throws {ParkrunDataNotAvailableError}
   * @see https://github.com/Prouser123/parkrun.js/issues/33
   */
  getSex() {
    throw new DataNotAvailableError(
      "getSex() - removed upstream as of Febuary 2020, see issue #33."
    );
  }

  /**
   * Gets the user's full name.
   *
   * @returns {String} full name
   */
  getFullName() {
    return `${this.getFirstName()} ${this.getLastName()}`;
  }

  /**
   * Get the user's run count.
   *
   * @returns {Promise<Number>} Run count.
   * @throws {ParkrunNetError} ParkrunJS Networking Error.
   */
  async getRunCount() {
    /*
     * We could use '/v1/hasrun/count/Run' or use '/v1/runs' (limit 1, offset 0).
     *
     * There is no visible benefit outside the margin of error at this time.
     */
    const res = await this._core
      ._getAuthedNet()
      .get("/v1/hasrun/count/Run", {
        params: { athleteId: this._athleteID, offset: 0 }
      })
      .catch(err => {
        throw new NetError(err);
      });
    // If the user has no runs, this will return NaN, so in that case just return 0.
   console.log(res.data.data)
    return Number.parseInt(res.data.data.TotalRuns[0].RunTotal) || 0;
  }



   async getTGFCounts(eventNum) {
    /*
     * Custom addition which returns an object showing run count, volunteer count specific to a
     * specified event number passed in
     * There is no visible benefit outside the margin of error at this time.
     */
    const res = await this._core
      ._getAuthedNet()
      .get(`/v1/events/${eventNum}/hasrun/volunteer/count`, {
        params: { athleteId: this._athleteID, offset: 0 }
      })
      .catch(err => {
        throw new NetError(err);
      });
   
    let athleteSummary = res.data.data.AthleteSummary[0]
    let TGFrunCount = parseInt(athleteSummary.RunTotal);
    let TGFvolCount = parseInt(athleteSummary.VolunteeringTotal);
   
    const counts = {TGFrunCount: TGFrunCount, TGFvolCount: TGFvolCount, }
    //console.log(counts)
    return counts
  }




  /**
   * Get a array of the user's runs.
   *
   * @returns {Promise<Array<RunResult>>}
   * 
   * @throws {ParkrunNetError} ParkrunJS Networking Error.
   */
  async getRuns() {
    const res = await this._core._multiGet(
      "/v1/results",
      {
        params: { athleteId: this._athleteID }
      },
      "Results",
      "ResultsRange"
    );
    
    return res.map(i => {
      return new RunResult(i);
    });
    // v2-e1f - [up to] 2x as fast as for loop for this kind of data.
  }

  // TypeDef for getClubs()
  /**
   * @typedef {Object} clubsResult
   *
   * @property {Object} ParkrunClub
   * @property {String} ParkrunClub.id
   * @property {String} ParkrunClub.name
   *
   * @property {Object} JuniorClub
   * @property {String} JuniorClub.id
   * @property {String} JuniorClub.name
   *
   * @property {Object} VolunteerClub
   * @property {String} VolunteerClub.id
   * @property {String} VolunteerClub.name
   */

  /**
   * Get the user's Parkrun Clubs (for milestone runs / duties)
   *
   * @returns {Promise<clubsResult>}
   * @throws {ParkrunNetError} ParkrunJS Networking Error.
   * @throws {ParkrunDataNotAvailableError} Error when no data is available, usually because of a new account with no runs.
   *
   * @example
   *
   * const user = .....
   *
   *
   * await user.getClubs()
   *
   * // Example Response:
   *
   * {
   *   ParkrunClub: { id: 'c3', name: '250+ Club' }
   *   JuniorClub: { id: 'j0', name: 'No Club' },
   *   VolunteerClub: { id: 'v1', name: 'Volunteer 25+ Club' }
   * }
   */
  async getClubs() {
    // We are using /v1/results (from getRuns() as it returns all club statuses at once.)
    const res = await this._core
      ._getAuthedNet()
      .get(`/v1/results`, {
        params: {
          athleteId: this._athleteID,
          limit: 1,
          offset: 0
        }
      })
      .catch(err => {
        throw new NetError(err);
      });
      
    const data = res.data.data.Results[0];
    if (data == undefined)
      throw new DataNotAvailableError("getClubs, athlete " + this.getID());
    return {
      ParkrunClub: ClubsEnums.CLUBS[data.parkrunClubMembership],
      JuniorClub: ClubsEnums.JUNIOR_CLUBS[data.JuniorClubMembership],
      VolunteerClub: ClubsEnums._volnFromCount(data.volcount)
    };
  }


async getCounts() {
    // We are using /v1/results (from getRuns() as it returns all club statuses at once.)
    const res = await this._core
      ._getAuthedNet()
      .get(`/v1/results`, {
        params: {
          athleteId: this._athleteID,
          limit: 1,
          offset: 0
        }
      })
      .catch(err => {
        throw new NetError(err);
      });
      
    const data = res.data.data.Results[0];
    //console.log(data)
    let obj={};
    if (data !== undefined) {
      obj = {runCount: data.RunTotal,
      volCount: data.volcount,
      };}
      else { 
      
        const pay = await this._core
      ._getAuthedNet()
      .get(`v1/athletes/${this._athleteID}/volunteerduties/Historical/DayTotals`, {
        
      })
      .catch(err => {
        throw new NetError(err);
      });
      obj = {runCount: '0',
      volCount: pay.data.data.VolunteerDuties[0].TotalDaysVolunteered,
      };}
    return obj;
  }


  /**
   * Get an array of {@link Event} objects for each parkrun that the athlete has run, in alphabetical order.
   *
   * @see (Borrows from {@link Parkrun#getAthleteParkruns})
   *
   * @returns {Promise<Array<Event>>}
   * @throws {ParkrunNetError} ParkrunJS Networking Error.
   */
  async getEvents() {
    return this._core.getAthleteParkruns(this._athleteID);
  }

 async getAthleteExtras() {

    const res = await this._core
      ._getAuthedNet()
      .get(`/v1/athletes/${this._athleteID}`)
      .catch(err => {
        throw new NetError(err);
      });
    
      const athlete = res.data.data.Athletes[0]
    return athlete;
  }

  async getTGFpb(eventNum) {

    const res = await this._core
      ._getAuthedNet()
      .get(`/v1/athletes/${this._athleteID}/events/${eventNum}/pbs`)
      .catch(err => {
        throw new NetError(err);
      });
    
    const data = res.data.data.PBs[0]
    
    let obj='';
    if (data === undefined) {
      obj = 'not a runner!';
      }
      else { obj = data.RunTime };
      //const athlete = res.data.data.Athletes[0]
    return obj;
    }
  
  

}

module.exports = User;
